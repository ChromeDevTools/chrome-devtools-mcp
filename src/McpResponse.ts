/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {WebMCPTool} from 'puppeteer-core';

import type {ParsedArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import {ConsoleFormatter} from './formatters/ConsoleFormatter.js';
import {
  HeapSnapshotFormatter,
  isEdgeLike,
  isNodeLike,
} from './formatters/HeapSnapshotFormatter.js';
import {IssueFormatter} from './formatters/IssueFormatter.js';
import {NetworkFormatter} from './formatters/NetworkFormatter.js';
import {SnapshotFormatter} from './formatters/SnapshotFormatter.js';
import type {
  HeapSnapshotAggregateData,
  HeapSnapshotClassDiff,
  HeapSnapshotDetailedClassDiff,
  DuplicateStringGroup,
} from './HeapSnapshotManager.js';
import type {McpContext} from './McpContext.js';
import type {McpPage} from './McpPage.js';
import {UncaughtError} from './PageCollector.js';
import {TextSnapshot} from './TextSnapshot.js';
import {
  DevTools,
  getToonEncode,
  getGcfEncode,
  type Protocol,
} from './third_party/index.js';
import type {
  ConsoleMessage,
  ImageContent,
  Page,
  ResourceType,
  TextContent,
  JSONSchema7Definition,
  Extension,
} from './third_party/index.js';
import {handleDialog} from './tools/pages.js';
import type {ToolGroups} from './tools/thirdPartyDeveloper.js';
import type {
  DevToolsData,
  ImageContentData,
  LighthouseData,
  Response,
  SnapshotParams,
} from './tools/ToolDefinition.js';
import type {InsightName, TraceResult} from './trace-processing/parse.js';
import {getInsightOutput, getTraceSummary} from './trace-processing/parse.js';
import {paginate} from './utils/pagination.js';
import type {PaginationOptions} from './utils/types.js';
import type {WaitForEventsResult} from './WaitForHelper.js';

export type DataFormat = 'default' | 'toon' | 'gcf';

interface TraceInsightData {
  trace: TraceResult;
  insightSetId: string;
  insightName: InsightName;
}

export function replaceHtmlElementsWithUids(schema: JSONSchema7Definition) {
  if (typeof schema === 'boolean') {
    return;
  }

  let isHtmlElement = false;
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'x-mcp-type' && value === 'HTMLElement') {
      isHtmlElement = true;
      break;
    }
  }

  if (isHtmlElement) {
    schema.properties = {uid: {type: 'string'}};
    schema.required = ['uid'];
  }

  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      replaceHtmlElementsWithUids(schema.properties[key]);
    }
  }

  if (schema.items) {
    if (Array.isArray(schema.items)) {
      for (const item of schema.items) {
        replaceHtmlElementsWithUids(item);
      }
    } else {
      replaceHtmlElementsWithUids(schema.items);
    }
  }

  if (schema.anyOf) {
    for (const s of schema.anyOf) {
      replaceHtmlElementsWithUids(s);
    }
  }
  if (schema.allOf) {
    for (const s of schema.allOf) {
      replaceHtmlElementsWithUids(s);
    }
  }
  if (schema.oneOf) {
    for (const s of schema.oneOf) {
      replaceHtmlElementsWithUids(s);
    }
  }
}

async function getToolGroups(page: McpPage): Promise<ToolGroups> {
  // Check if there is a `devtoolstooldiscovery` event listener
  const windowHandle = await page.pptrPage.evaluateHandle(() => window);
  // @ts-expect-error internal API
  const client = page.pptrPage._client();
  const {listeners}: {listeners: Protocol.DOMDebugger.EventListener[]} =
    await client.send('DOMDebugger.getEventListeners', {
      objectId: windowHandle.remoteObject().objectId,
    });
  if (listeners.find(l => l.type === 'devtoolstooldiscovery') === undefined) {
    return [];
  }

  const toolGroups = await page.pptrPage.evaluate(() => {
    if (window.__dtmcp) {
      window.__dtmcp.toolGroups = [];
    }
    return new Promise<ToolGroups>(resolve => {
      const event = new CustomEvent('devtoolstooldiscovery');
      const groups: ToolGroups = [];
      // @ts-expect-error Adding custom property
      event.respondWith = toolGroup => {
        if (!window.__dtmcp) {
          window.__dtmcp = {};
        }
        if (!window.__dtmcp.toolGroups) {
          window.__dtmcp.toolGroups = [];
        }

        if (
          typeof toolGroup.name !== 'string' ||
          (toolGroup.description &&
            typeof toolGroup.description !== 'string') ||
          !Array.isArray(toolGroup.tools)
        ) {
          console.error('Invalid toolGroup:', toolGroup);
          return;
        }
        for (const tool of toolGroup.tools) {
          if (
            typeof tool.name !== 'string' ||
            typeof tool.description !== 'string' ||
            typeof tool.inputSchema !== 'object' ||
            typeof tool.execute !== 'function'
          ) {
            console.error('Invalid tool:', tool);
            return;
          }
        }

        window.__dtmcp.toolGroups.push(toolGroup);

        // When receiving a toolGroup for the first time, expose a simple execution helper
        if (!window.__dtmcp.executeTool) {
          window.__dtmcp.executeTool = async (toolName, args) => {
            if (
              !window.__dtmcp?.toolGroups ||
              window.__dtmcp.toolGroups.length === 0
            ) {
              throw new Error('No tools found on the page');
            }
            for (const group of window.__dtmcp.toolGroups) {
              const tool = group.tools?.find(t => t.name === toolName);
              if (tool) {
                return await tool.execute(args);
              }
            }
            throw new Error(`Tool ${toolName} not found`);
          };
        }

        groups.push(toolGroup);
      };
      window.dispatchEvent(event);
      // If at least one toolGroup was added synchronously, resolve with the array.
      // Otherwise, use setTimeout to allow for any microtask/asynchronous respondWith calls, or resolve with an empty array.
      if (groups.length > 0) {
        resolve(groups);
      } else {
        setTimeout(() => {
          if (groups.length > 0) {
            resolve(groups);
          } else {
            resolve([]);
          }
        }, 0);
      }
    });
  });

  for (const group of toolGroups) {
    for (const tool of group.tools ?? []) {
      replaceHtmlElementsWithUids(tool.inputSchema);
    }
  }
  return toolGroups;
}

export class McpResponse implements Response {
  #includePages = false;
  #includeExtensionServiceWorkers = false;
  #includeExtensionPages = false;
  #snapshotParams?: SnapshotParams;
  #attachedNetworkRequestId?: number;
  #attachedNetworkRequestOptions?: {
    requestFilePath?: string;
    responseFilePath?: string;
  };
  #attachedConsoleMessageId?: number;
  #attachedTraceSummary?: TraceResult;
  #attachedTraceInsight?: TraceInsightData;
  #attachedLighthouseResult?: LighthouseData;
  #textResponseLines: string[] = [];
  #images: ImageContentData[] = [];
  #heapSnapshotOptions?: {
    include: boolean;
    aggregateData?: HeapSnapshotAggregateData;
    pagination?: PaginationOptions;
    stats?: DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics;
    staticData?: DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null;
    nodes?: DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange;
    retainingPaths?: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths;
    dominators?: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain;
    classDiffs?: HeapSnapshotClassDiff[];
    detailedClassDiff?: HeapSnapshotDetailedClassDiff;
    duplicateStrings?: DuplicateStringGroup[];
  };
  #networkRequestsOptions?: {
    include: boolean;
    pagination?: PaginationOptions;
    resourceTypes?: ResourceType[];
    includePreservedRequests?: boolean;
    networkRequestIdInDevToolsUI?: number;
  };
  #consoleDataOptions?: {
    include: boolean;
    pagination?: PaginationOptions;
    types?: string[];
    includePreservedMessages?: boolean;
    serviceWorkerId?: string;
  };
  #listExtensions?: boolean;
  #listThirdPartyDeveloperTools?: boolean;
  #listWebMcpTools?: boolean;
  #devToolsData?: DevToolsData;
  #tabId?: string;
  #args: ParsedArguments;
  #page?: McpPage;
  #redactNetworkHeaders = true;
  #error?: Error;
  #attachedWaitForResult?: WaitForEventsResult;

  get #deviceScope(): DevTools.CrUXManager.DeviceScope {
    return this.#page?.viewport?.isMobile ? 'PHONE' : 'DESKTOP';
  }

  constructor(args: ParsedArguments) {
    this.#args = args;
  }

  setPage(page: McpPage): void {
    this.#page = page;
  }

  setRedactNetworkHeaders(value: boolean): void {
    this.#redactNetworkHeaders = value;
  }

  attachDevToolsData(data: DevToolsData): void {
    this.#devToolsData = data;
  }

  setTabId(tabId: string): void {
    this.#tabId = tabId;
  }

  setIncludePages(value: boolean): void {
    this.#includePages = value;

    if (this.#args.categoryExtensions) {
      this.#includeExtensionServiceWorkers = value;
      this.#includeExtensionPages = value;
    }
  }

  includeSnapshot(params?: SnapshotParams): void {
    this.#snapshotParams = params ?? {
      verbose: false,
    };
  }

  setListExtensions(): void {
    this.#listExtensions = true;
  }

  setListThirdPartyDeveloperTools(): void {
    this.#listThirdPartyDeveloperTools = true;
  }

  setListWebMcpTools(): void {
    this.#listWebMcpTools = true;
  }

  setIncludeNetworkRequests(
    value: boolean,
    options?: PaginationOptions & {
      resourceTypes?: ResourceType[];
      includePreservedRequests?: boolean;
      networkRequestIdInDevToolsUI?: number;
    },
  ): void {
    if (!value) {
      this.#networkRequestsOptions = undefined;
      return;
    }

    this.#networkRequestsOptions = {
      include: value,
      pagination:
        options?.pageSize || options?.pageIdx
          ? {
              pageSize: options.pageSize,
              pageIdx: options.pageIdx,
            }
          : undefined,
      resourceTypes: options?.resourceTypes,
      includePreservedRequests: options?.includePreservedRequests,
      networkRequestIdInDevToolsUI: options?.networkRequestIdInDevToolsUI,
    };
  }

  setIncludeConsoleData(
    value: boolean,
    options?: PaginationOptions & {
      types?: string[];
      includePreservedMessages?: boolean;
      serviceWorkerId?: string;
    },
  ): void {
    if (!value) {
      this.#consoleDataOptions = undefined;
      return;
    }

    this.#consoleDataOptions = {
      include: value,
      pagination:
        options?.pageSize || options?.pageIdx
          ? {
              pageSize: options.pageSize,
              pageIdx: options.pageIdx,
            }
          : undefined,
      types: options?.types,
      includePreservedMessages: options?.includePreservedMessages,
      serviceWorkerId: options?.serviceWorkerId,
    };
  }

  setError(error: Error): void {
    this.#error = error;
  }

  attachNetworkRequest(
    reqId: number,
    options?: {requestFilePath?: string; responseFilePath?: string},
  ): void {
    this.#attachedNetworkRequestId = reqId;
    this.#attachedNetworkRequestOptions = options;
  }

  attachConsoleMessage(msgid: number): void {
    this.#attachedConsoleMessageId = msgid;
  }

  attachTraceSummary(result: TraceResult): void {
    this.#attachedTraceSummary = result;
  }

  attachTraceInsight(
    trace: TraceResult,
    insightSetId: string,
    insightName: InsightName,
  ): void {
    this.#attachedTraceInsight = {
      trace,
      insightSetId,
      insightName,
    };
  }

  attachLighthouseResult(result: LighthouseData): void {
    this.#attachedLighthouseResult = result;
  }

  get includePages(): boolean {
    return this.#includePages;
  }

  get attachedTraceSummary(): TraceResult | undefined {
    return this.#attachedTraceSummary;
  }

  get attachedTracedInsight(): TraceInsightData | undefined {
    return this.#attachedTraceInsight;
  }

  get attachedLighthouseResult(): LighthouseData | undefined {
    return this.#attachedLighthouseResult;
  }

  get includeNetworkRequests(): boolean {
    return this.#networkRequestsOptions?.include ?? false;
  }

  get includeConsoleData(): boolean {
    return this.#consoleDataOptions?.include ?? false;
  }
  get attachedNetworkRequestId(): number | undefined {
    return this.#attachedNetworkRequestId;
  }
  get networkRequestsPageIdx(): number | undefined {
    return this.#networkRequestsOptions?.pagination?.pageIdx;
  }
  get consoleMessagesPageIdx(): number | undefined {
    return this.#consoleDataOptions?.pagination?.pageIdx;
  }
  get consoleMessagesTypes(): string[] | undefined {
    return this.#consoleDataOptions?.types;
  }

  get error(): Error | undefined {
    return this.#error;
  }

  appendResponseLine(value: string): void {
    this.#textResponseLines.push(value);
  }

  attachWaitForResult(result: WaitForEventsResult): void {
    this.#attachedWaitForResult = result;
  }

  setHeapSnapshotAggregates(
    aggregateData: HeapSnapshotAggregateData,
    options?: PaginationOptions,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      aggregateData,
      pagination: options,
    };
  }

  setHeapSnapshotStats(
    stats: DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics,
    staticData: DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      stats,
      staticData,
    };
  }

  setHeapSnapshotNodes(
    nodes: DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange,
    options?: PaginationOptions,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      nodes,
      pagination: options,
    };
  }

  setHeapSnapshotDuplicateStrings(
    duplicateStrings: DuplicateStringGroup[],
    options?: PaginationOptions,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      duplicateStrings,
      pagination: options,
    };
  }

  setHeapSnapshotRetainingPaths(
    retainingPaths: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      retainingPaths,
    };
  }

  setHeapSnapshotDominators(
    dominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      dominators,
    };
  }

  setHeapSnapshotClassDiffs(classDiffs: HeapSnapshotClassDiff[]) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      classDiffs,
    };
  }

  setHeapSnapshotDetailedClassDiff(
    detailedClassDiff: HeapSnapshotDetailedClassDiff,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      detailedClassDiff,
    };
  }

  attachImage(value: ImageContentData): void {
    this.#images.push(value);
  }

  get responseLines(): readonly string[] {
    return this.#textResponseLines;
  }

  get images(): ImageContentData[] {
    return this.#images;
  }

  get snapshotParams(): SnapshotParams | undefined {
    return this.#snapshotParams;
  }

  get listWebMcpTools(): boolean | undefined {
    return this.#listWebMcpTools;
  }

  async handle(
    toolName: string,
    context: McpContext,
    dataFormat: DataFormat = 'default',
  ): Promise<{
    content: Array<TextContent | ImageContent>;
    structuredContent: object;
  }> {
    if (this.#includePages) {
      await context.createPagesSnapshot();
    }

    if (this.#includeExtensionServiceWorkers) {
      await context.createExtensionServiceWorkersSnapshot();
    }

    let snapshot: SnapshotFormatter | string | undefined;
    if (this.#snapshotParams) {
      if (!this.#page) {
        throw new Error('Response must have a page');
      }
      this.#page.textSnapshot = await TextSnapshot.create(this.#page, {
        verbose: this.#snapshotParams.verbose,
        devtoolsData: this.#devToolsData,
      });
      const textSnapshot = this.#page.textSnapshot;
      if (textSnapshot) {
        const formatter = new SnapshotFormatter(textSnapshot);
        if (this.#snapshotParams.filePath) {
          const result = await context.saveFile(
            new TextEncoder().encode(formatter.toString()),
            this.#snapshotParams.filePath,
            '.txt',
          );
          snapshot = result.filename;
        } else {
          snapshot = formatter;
        }
      }
    }

    let detailedNetworkRequest: NetworkFormatter | undefined;
    if (this.#attachedNetworkRequestId) {
      if (!this.#page) {
        throw new Error(`Response must have an McpPage`);
      }
      const request = this.#page.getNetworkRequestById(
        this.#attachedNetworkRequestId,
      );
      const formatter = await NetworkFormatter.from(request, {
        requestId: this.#attachedNetworkRequestId,
        requestIdResolver: req =>
          context.getSelectedMcpPage().getNetworkRequestStableId(req),
        fetchData: true,
        requestFilePath: this.#attachedNetworkRequestOptions?.requestFilePath,
        responseFilePath: this.#attachedNetworkRequestOptions?.responseFilePath,
        saveFile: (data, filename, extension) =>
          context.saveFile(data, filename, extension),
        redactNetworkHeaders: this.#redactNetworkHeaders,
      });
      detailedNetworkRequest = formatter;
    }

    let detailedConsoleMessage: ConsoleFormatter | IssueFormatter | undefined;

    if (this.#attachedConsoleMessageId) {
      if (!this.#page) {
        throw new Error(`Response must have an McpPage`);
      }

      const message = this.#page.getConsoleMessageById(
        this.#attachedConsoleMessageId,
      );
      const consoleMessageStableId = this.#attachedConsoleMessageId;
      if ('args' in message || message instanceof UncaughtError) {
        const consoleMessage = message as ConsoleMessage | UncaughtError;
        const devTools = context.getDevToolsUniverse(this.#page);
        detailedConsoleMessage = await ConsoleFormatter.from(consoleMessage, {
          id: consoleMessageStableId,
          fetchDetailedData: true,
          devTools: devTools ?? undefined,
        });
      } else if (message instanceof DevTools.AggregatedIssue) {
        const formatter = new IssueFormatter(message, {
          id: consoleMessageStableId,
          requestIdResolver: this.#page.resolveCdpRequestId.bind(this.#page),
          elementIdResolver: this.#page.textSnapshot?.resolveCdpElementId.bind(
            this.#page.textSnapshot,
          ),
        });
        if (!formatter.isValid()) {
          throw new Error(
            "Can't provide details for the msgid " + consoleMessageStableId,
          );
        }
        detailedConsoleMessage = formatter;
      }
    }

    let extensions: Map<string, Extension> | undefined;
    if (this.#listExtensions) {
      extensions = await context.listExtensions();
    }

    let thirdPartyDeveloperTools: ToolGroups = [];
    if (
      this.#args.categoryExperimentalThirdParty &&
      this.#listThirdPartyDeveloperTools &&
      this.#page
    ) {
      thirdPartyDeveloperTools = await getToolGroups(this.#page);
      if (thirdPartyDeveloperTools) {
        this.#page.thirdPartyDeveloperTools = thirdPartyDeveloperTools;
      }
    }

    let webmcpTools: WebMCPTool[] | undefined;
    if (
      this.#args.categoryExperimentalWebmcp &&
      this.#listWebMcpTools &&
      this.#page
    ) {
      webmcpTools = this.#page.getWebMcpTools();
    }

    let consoleMessages: Array<ConsoleFormatter | IssueFormatter> | undefined;
    if (this.#consoleDataOptions?.include) {
      let messages;
      let page: McpPage | undefined;

      if (this.#consoleDataOptions.serviceWorkerId) {
        messages = context.getServiceWorkerConsoleData(
          this.#consoleDataOptions.serviceWorkerId,
        );
      } else {
        page = this.#page;
        if (!page) {
          throw new Error(`Response must have an McpPage`);
        }
        messages = page.getConsoleData(
          this.#consoleDataOptions.includePreservedMessages,
        );
      }

      if (this.#consoleDataOptions.types?.length) {
        const normalizedTypes = new Set(this.#consoleDataOptions.types);
        messages = messages.filter(message => {
          if ('type' in message) {
            return normalizedTypes.has(message.type());
          }
          if (message instanceof DevTools.AggregatedIssue) {
            return normalizedTypes.has('issue');
          }
          return normalizedTypes.has('error');
        });
      }

      consoleMessages = (
        await Promise.all(
          messages.map(
            async (item): Promise<ConsoleFormatter | IssueFormatter | null> => {
              const consoleMessageStableId = context
                .getSelectedMcpPage()
                .getConsoleMessageStableId(item);
              if ('args' in item || item instanceof UncaughtError) {
                const consoleMessage = item as ConsoleMessage | UncaughtError;
                const devTools = page
                  ? context.getDevToolsUniverse(page)
                  : null;
                return await ConsoleFormatter.from(consoleMessage, {
                  id: consoleMessageStableId,
                  fetchDetailedData: false,
                  devTools: devTools ?? undefined,
                });
              }
              if (item instanceof DevTools.AggregatedIssue) {
                const formatter = new IssueFormatter(item, {
                  id: consoleMessageStableId,
                });
                if (!formatter.isValid()) {
                  return null;
                }
                return formatter;
              }
              return null;
            },
          ),
        )
      ).filter(item => item !== null);
    }

    let networkRequests: NetworkFormatter[] | undefined;
    if (this.#networkRequestsOptions?.include) {
      if (!this.#page) {
        throw new Error(`Response must have an McpPage`);
      }
      let requests = this.#page.getNetworkRequests(
        this.#networkRequestsOptions?.includePreservedRequests,
      );

      // Apply resource type filtering if specified
      if (this.#networkRequestsOptions.resourceTypes?.length) {
        const normalizedTypes = new Set(
          this.#networkRequestsOptions.resourceTypes,
        );
        requests = requests.filter(request => {
          const type = request.resourceType();
          return normalizedTypes.has(type);
        });
      }

      if (requests.length) {
        networkRequests = await Promise.all(
          requests.map(request =>
            NetworkFormatter.from(request, {
              requestId: context
                .getSelectedMcpPage()
                .getNetworkRequestStableId(request),
              selectedInDevToolsUI:
                context
                  .getSelectedMcpPage()
                  .getNetworkRequestStableId(request) ===
                this.#networkRequestsOptions?.networkRequestIdInDevToolsUI,
              fetchData: false,
              saveFile: (data, filename, extension) =>
                context.saveFile(data, filename, extension),
              redactNetworkHeaders: this.#redactNetworkHeaders,
            }),
          ),
        );
      }
    }

    return this.format(
      toolName,
      context,
      {
        detailedConsoleMessage,
        consoleMessages,
        snapshot,
        detailedNetworkRequest,
        networkRequests,
        traceInsight: this.#attachedTraceInsight,
        traceSummary: this.#attachedTraceSummary,
        extensions,
        lighthouseResult: this.#attachedLighthouseResult,
        thirdPartyDeveloperTools,
        webmcpTools,
        errorMessage: this.#error?.message,
      },
      dataFormat,
    );
  }

  async format(
    toolName: string,
    context: McpContext,
    data: {
      detailedConsoleMessage: ConsoleFormatter | IssueFormatter | undefined;
      consoleMessages: Array<ConsoleFormatter | IssueFormatter> | undefined;
      snapshot: SnapshotFormatter | string | undefined;
      detailedNetworkRequest?: NetworkFormatter;
      networkRequests?: NetworkFormatter[];
      traceSummary?: TraceResult;
      traceInsight?: TraceInsightData;
      extensions?: Map<string, Extension>;
      lighthouseResult?: LighthouseData;
      thirdPartyDeveloperTools: ToolGroups;
      webmcpTools?: WebMCPTool[];
      errorMessage?: string;
    },
    dataFormat: DataFormat = 'default',
  ): Promise<{
    content: Array<TextContent | ImageContent>;
    structuredContent: object;
  }> {
    const structuredContent: {
      snapshot?: object;
      snapshotFilePath?: string;
      tabId?: string;
      networkRequest?: object;
      networkRequests?: object[];
      consoleMessage?: object;
      consoleMessages?: object[];
      traceSummary?: string;
      traceInsights?: Array<{insightName: string; insightKey: string}>;
      lighthouseResult?: object;
      extensions?: object[];
      thirdPartyDeveloperTools?: object[];
      webmcpTools?: object[];
      message?: string;
      networkConditions?: string;
      navigationTimeout?: number;
      viewport?: object;
      userAgent?: string;
      cpuThrottlingRate?: number;
      colorScheme?: string;
      dialog?: {
        type: string;
        message: string;
        defaultValue?: string;
      };
      pages?: object[];
      pagination?: object;
      heapSnapshot?: {
        stats?: object;
        staticData?: object;
        aggregateStats?: {
          objectCount: number;
          totalSelfSize: number;
        };
      };
      heapSnapshotData?: object[];
      heapSnapshotNodes?: readonly object[];
      heapSnapshotRetainingPaths?: object;
      heapSnapshotDominators?: readonly object[];
      heapSnapshotClassDiffs?: HeapSnapshotClassDiff[];
      heapSnapshotDetailedClassDiff?: HeapSnapshotDetailedClassDiff;
      heapSnapshotDuplicateStrings?: readonly DuplicateStringGroup[];
      extensionServiceWorkers?: object[];
      extensionPages?: object[];
      errorMessage?: string;
      navigatedToUrl?: string;
      geolocation?: {latitude: number; longitude: number};
    } = {};

    // Resolve the compact encoder based on the chosen format
    let compactEncode: ((val: unknown) => string) | undefined;
    if (dataFormat === 'toon') {
      try {
        compactEncode = await getToonEncode();
      } catch {
        throw new Error(
          'The `@toon-format/toon` package is required to use --experimentalDataFormat=toon. ' +
            'Make sure the peer dependency is installed:\n' +
            '- For npx: npx --package chrome-devtools-mcp@latest --package @toon-format/toon@latest chrome-devtools-mcp --experimentalDataFormat=toon\n' +
            '- For npm: npm install @toon-format/toon (add -g if installed globally)',
        );
      }
    } else if (dataFormat === 'gcf') {
      try {
        compactEncode = await getGcfEncode();
      } catch {
        throw new Error(
          'The `@blackwell-systems/gcf` package is required to use --experimentalDataFormat=gcf. ' +
            'Make sure the peer dependency is installed:\n' +
            '- For npx: npx --package chrome-devtools-mcp@latest --package @blackwell-systems/gcf@latest chrome-devtools-mcp --experimentalDataFormat=gcf\n' +
            '- For npm: npm install @blackwell-systems/gcf (add -g if installed globally)',
        );
      }
    }

    const response = [];
    if (this.#textResponseLines.length) {
      structuredContent.message = this.#textResponseLines.join('\n');
      response.push(...this.#textResponseLines);
    }

    if (this.#attachedWaitForResult) {
      if (this.#attachedWaitForResult.navigatedToUrl) {
        response.push(
          `Page navigated to ${this.#attachedWaitForResult.navigatedToUrl}.`,
        );
        structuredContent.navigatedToUrl =
          this.#attachedWaitForResult.navigatedToUrl;
      }
    }

    const networkConditions = this.#page?.networkConditions;
    if (networkConditions) {
      const timeout = this.#page!.pptrPage.getDefaultNavigationTimeout();
      response.push(`Emulating network conditions: ${networkConditions}`);
      response.push(`Default navigation timeout set to ${timeout} ms`);
      structuredContent.networkConditions = networkConditions;
      structuredContent.navigationTimeout = timeout;
    }

    const geolocation = this.#page?.geolocation;
    if (geolocation) {
      response.push(
        `Emulating geolocation: latitude=${geolocation.latitude}, longitude=${geolocation.longitude}`,
      );
      structuredContent.geolocation = geolocation;
    }

    const viewport = this.#page?.viewport;
    if (viewport) {
      response.push(`Emulating viewport: ${JSON.stringify(viewport)}`);
      structuredContent.viewport = viewport;
    }

    const userAgent = this.#page?.userAgent;
    if (userAgent) {
      response.push(`Emulating user agent: ${userAgent}`);
      structuredContent.userAgent = userAgent;
    }

    const cpuThrottlingRate = this.#page?.cpuThrottlingRate ?? 1;
    if (cpuThrottlingRate > 1) {
      response.push(`Emulating CPU throttling: ${cpuThrottlingRate}x slowdown`);
      structuredContent.cpuThrottlingRate = cpuThrottlingRate;
    }

    const colorScheme = this.#page?.colorScheme;
    if (colorScheme) {
      response.push(`Emulating color scheme: ${colorScheme}`);
      structuredContent.colorScheme = colorScheme;
    }

    const dialog = this.#page?.getDialog();
    if (dialog) {
      const defaultValueIfNeeded =
        dialog.type() === 'prompt'
          ? ` (default value: "${dialog.defaultValue()}")`
          : '';
      response.push(`# Open dialog
${dialog.type()}: ${dialog.message()}${defaultValueIfNeeded}.
Call ${handleDialog.name} to handle it before continuing.`);
      structuredContent.dialog = {
        type: dialog.type(),
        message: dialog.message(),
        defaultValue: dialog.defaultValue(),
      };
    }

    if (this.#includePages) {
      const allPages = context.getPages();

      const {regularPages, extensionPages} = allPages.reduce(
        (
          acc: {regularPages: McpPage[]; extensionPages: McpPage[]},
          mcpPage: McpPage,
        ) => {
          if (mcpPage.pptrPage.url().startsWith('chrome-extension://')) {
            acc.extensionPages.push(mcpPage);
          } else {
            acc.regularPages.push(mcpPage);
          }
          return acc;
        },
        {regularPages: [], extensionPages: []},
      );

      const selectionFallback = context.getSelectedPageFallback();
      if (selectionFallback) {
        let selectedPageId: number | undefined;
        try {
          selectedPageId = context.getSelectedMcpPage().id;
        } catch {
          selectedPageId = undefined;
        }
        response.push(
          `Note: the previously selected page ${selectionFallback.wasClosed ? 'was closed' : 'is no longer listed'}.${selectedPageId !== undefined ? ` Page ${selectedPageId} is now selected.` : ''}`,
        );
      }
      if (regularPages.length) {
        const parts = [`## Pages`];
        const structuredPages = [];
        for (const mcpPage of regularPages) {
          const isolatedContextName = mcpPage.isolatedContextName;
          const contextLabel = isolatedContextName
            ? ` isolatedContext=${isolatedContextName}`
            : '';
          const title = await fetchPageTitle(mcpPage.pptrPage);
          const pageLabel = title
            ? `${truncateTitle(title)} (${mcpPage.pptrPage.url()})`
            : mcpPage.pptrPage.url();
          parts.push(
            `${mcpPage.id}: ${pageLabel}${context.isPageSelected(mcpPage) ? ' [selected]' : ''}${contextLabel}`,
          );
          structuredPages.push(createStructuredPage(mcpPage, context, title));
        }
        response.push(...parts);
        structuredContent.pages = structuredPages;
      }

      if (this.#includeExtensionPages) {
        if (extensionPages.length) {
          response.push(`## Extension Pages`);
          const structuredExtensionPages = [];
          for (const mcpPage of extensionPages) {
            const isolatedContextName = mcpPage.isolatedContextName;
            const contextLabel = isolatedContextName
              ? ` isolatedContext=${isolatedContextName}`
              : '';
            const title = await fetchPageTitle(mcpPage.pptrPage);
            const pageLabel = title
              ? `${truncateTitle(title)} (${mcpPage.pptrPage.url()})`
              : mcpPage.pptrPage.url();
            response.push(
              `${mcpPage.id}: ${pageLabel}${context.isPageSelected(mcpPage) ? ' [selected]' : ''}${contextLabel}`,
            );
            structuredExtensionPages.push(
              createStructuredPage(mcpPage, context, title),
            );
          }
          structuredContent.extensionPages = structuredExtensionPages;
        }
      }
    }

    if (this.#includeExtensionServiceWorkers) {
      if (context.getExtensionServiceWorkers().length) {
        response.push(`## Extension Service Workers`);
      }

      for (const extensionServiceWorker of context.getExtensionServiceWorkers()) {
        response.push(
          `${extensionServiceWorker.id}: ${extensionServiceWorker.url}`,
        );
      }
      structuredContent.extensionServiceWorkers = context
        .getExtensionServiceWorkers()
        .map(extensionServiceWorker => {
          return {
            id: extensionServiceWorker.id,
            url: extensionServiceWorker.url,
          };
        });
    }

    if (this.#tabId) {
      structuredContent.tabId = this.#tabId;
    }

    if (data.traceSummary) {
      const summary = getTraceSummary(data.traceSummary, this.#deviceScope);
      response.push(summary);
      structuredContent.traceSummary = summary;
      structuredContent.traceInsights = [];
      for (const insightSet of data.traceSummary.insights?.values() ?? []) {
        for (const [insightName, model] of Object.entries(insightSet.model)) {
          structuredContent.traceInsights.push({
            insightName,
            insightKey: model.insightKey,
          });
        }
      }
    }

    if (data.traceInsight) {
      const insightOutput = getInsightOutput(
        data.traceInsight.trace,
        data.traceInsight.insightSetId,
        data.traceInsight.insightName,
        this.#deviceScope,
      );
      if ('error' in insightOutput) {
        response.push(insightOutput.error);
      } else {
        response.push(insightOutput.output);
      }
    }

    if (data.lighthouseResult) {
      structuredContent.lighthouseResult = data.lighthouseResult;
      const {summary, reports} = data.lighthouseResult;
      response.push('## Lighthouse Audit Results');
      response.push(`Mode: ${summary.mode}`);
      response.push(`Device: ${summary.device}`);
      response.push(`URL: ${summary.url}`);
      response.push('### Category Scores');
      for (const score of summary.scores) {
        response.push(
          `- ${score.title}: ${(score.score ?? 0) * 100} (${score.id})`,
        );
      }
      response.push('### Audit Summary');
      response.push(`Passed: ${summary.audits.passed}`);
      response.push(`Failed: ${summary.audits.failed}`);
      response.push(`Total Timing: ${summary.timing.total}ms`);
      response.push('### Reports');
      for (const report of reports) {
        response.push(`- ${report}`);
      }
    }

    if (data.snapshot) {
      if (typeof data.snapshot === 'string') {
        response.push(`Saved snapshot to ${data.snapshot}.`);
        structuredContent.snapshotFilePath = data.snapshot;
      } else {
        structuredContent.snapshot = data.snapshot.toJSON();
        response.push('## Latest page snapshot');
        response.push(
          compactEncode
            ? compactEncode(structuredContent.snapshot)
            : data.snapshot.toString(),
        );
      }
    }

    if (this.#heapSnapshotOptions?.include) {
      response.push('## Heap Snapshot Data');
      const stats = this.#heapSnapshotOptions.stats;
      const staticData = this.#heapSnapshotOptions.staticData;
      if (stats) {
        response.push(`Statistics: ${JSON.stringify(stats, null, 2)}`);
        structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
        structuredContent.heapSnapshot.stats = stats;
      }
      if (staticData) {
        response.push(`Static Data: ${JSON.stringify(staticData, null, 2)}`);
        structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
        structuredContent.heapSnapshot.staticData = staticData;
      }
      const aggregateData = this.#heapSnapshotOptions.aggregateData;
      if (aggregateData) {
        const sortedEntries = HeapSnapshotFormatter.sort(
          aggregateData.aggregates,
        );

        const paginationData = this.#dataWithPagination(
          sortedEntries,
          this.#heapSnapshotOptions.pagination,
        );

        response.push(`Objects: ${aggregateData.objectCount}`);
        response.push(
          `Total shallow size: ${DevTools.I18n.ByteUtilities.formatBytesToKb(
            aggregateData.totalSelfSize,
          )}`,
        );
        structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
        structuredContent.heapSnapshot.aggregateStats = {
          objectCount: aggregateData.objectCount,
          totalSelfSize: aggregateData.totalSelfSize,
        };
        structuredContent.pagination = paginationData.pagination;
        response.push(...paginationData.info);

        const paginatedRecord = Object.fromEntries(paginationData.items);
        const formatter = new HeapSnapshotFormatter(paginatedRecord);

        structuredContent.heapSnapshotData = formatter.toJSON();
        response.push(
          compactEncode
            ? compactEncode(structuredContent.heapSnapshotData)
            : formatter.toString(),
        );
      }
      const nodes = this.#heapSnapshotOptions.nodes;
      if (nodes) {
        let items = Array.from(nodes.items);
        const firstItem = nodes.items[0];
        if (firstItem) {
          if (isNodeLike(firstItem)) {
            items = items
              .filter(isNodeLike)
              .sort((a, b) => b.retainedSize - a.retainedSize);
          } else if (isEdgeLike(firstItem)) {
            items = items.filter(isEdgeLike);
          }
        }

        const paginationData = this.#dataWithPagination(
          items,
          this.#heapSnapshotOptions.pagination,
        );

        response.push(HeapSnapshotFormatter.formatNodes(paginationData.items));

        structuredContent.pagination = paginationData.pagination;
        response.push(...paginationData.info);

        structuredContent.heapSnapshotNodes = paginationData.items;
      }
      const retainingPaths = this.#heapSnapshotOptions.retainingPaths;
      if (retainingPaths) {
        response.push('### Retaining Paths');
        const {paths, limitsReached} = retainingPaths;
        if (paths.length === 0) {
          response.push('No retaining paths found.');
        } else {
          response.push(HeapSnapshotFormatter.formatRetainingPaths(paths));
        }
        const reached = Object.entries(limitsReached)
          .filter(([, hit]) => hit)
          .map(([limit]) => limit);
        if (reached.length > 0) {
          response.push(
            `Note: results are truncated, the following limits were reached: ${reached.join(', ')}.`,
          );
        }
        structuredContent.heapSnapshotRetainingPaths =
          retainingPaths as unknown as object;
      }
      const dominators = this.#heapSnapshotOptions.dominators;
      if (dominators) {
        response.push('### Dominator Chain');
        if (dominators.length === 0) {
          response.push('No dominators found.');
        } else {
          response.push(HeapSnapshotFormatter.formatDominators(dominators));
        }
        structuredContent.heapSnapshotDominators = dominators;
      }
      const classDiffs = this.#heapSnapshotOptions.classDiffs;
      if (classDiffs) {
        response.push('### Heap Snapshot Diff');
        response.push(
          compactEncode
            ? compactEncode(classDiffs)
            : HeapSnapshotFormatter.formatDiffSummary(classDiffs),
        );
        structuredContent.heapSnapshotClassDiffs = classDiffs;
      }
      const detailedClassDiff = this.#heapSnapshotOptions.detailedClassDiff;
      if (detailedClassDiff) {
        response.push('### Heap Snapshot Detailed Diff');
        response.push(
          compactEncode
            ? compactEncode(detailedClassDiff)
            : HeapSnapshotFormatter.formatDiffDetails(detailedClassDiff),
        );
        structuredContent.heapSnapshotDetailedClassDiff = detailedClassDiff;
      }
      const duplicateStrings = this.#heapSnapshotOptions.duplicateStrings;
      if (duplicateStrings) {
        response.push('### Duplicate Strings');
        const paginationData = this.#dataWithPagination(
          duplicateStrings,
          this.#heapSnapshotOptions.pagination,
        );

        structuredContent.pagination = paginationData.pagination;
        response.push(...paginationData.info);

        const formatted = HeapSnapshotFormatter.formatDuplicateStrings(
          paginationData.items,
        );
        response.push(formatted);

        structuredContent.heapSnapshotDuplicateStrings = paginationData.items;
      }
    }

    if (data.detailedNetworkRequest) {
      response.push(data.detailedNetworkRequest.toStringDetailed());
      structuredContent.networkRequest =
        data.detailedNetworkRequest.toJSONDetailed();
    }

    if (data.detailedConsoleMessage) {
      response.push(data.detailedConsoleMessage.toStringDetailed());
      structuredContent.consoleMessage =
        data.detailedConsoleMessage.toJSONDetailed();
    }

    if (data.extensions) {
      const extensionArray = Array.from(data.extensions.values());
      structuredContent.extensions = extensionArray;
      response.push('## Extensions');
      if (extensionArray.length === 0) {
        response.push('No extensions installed.');
      } else {
        const extensionsMessage = extensionArray
          .map(extension => {
            return `id=${extension.id} "${extension.name}" v${extension.version} ${extension.enabled ? 'Enabled' : 'Disabled'}`;
          })
          .join('\n');
        response.push(extensionsMessage);
      }
    }

    if (data.thirdPartyDeveloperTools.length) {
      structuredContent.thirdPartyDeveloperTools =
        data.thirdPartyDeveloperTools;
      response.push('## Third-party developer tools');
      for (const toolGroup of data.thirdPartyDeveloperTools) {
        response.push(`${toolGroup.name}: ${toolGroup.description}`);
        response.push('Available tools:');
        const toolDefinitionsMessage = toolGroup.tools
          .map(tool => {
            return `name="${tool.name}", description="${tool.description}", inputSchema=${JSON.stringify(
              tool.inputSchema,
            )}`;
          })
          .join('\n');
        response.push(toolDefinitionsMessage);
      }
    }

    if (this.#listWebMcpTools && data.webmcpTools) {
      structuredContent.webmcpTools = data.webmcpTools.map(
        ({name, description, inputSchema, annotations}) => ({
          name,
          description,
          inputSchema,
          annotations,
        }),
      );
      response.push('## WebMCP tools');
      if (data.webmcpTools.length === 0) {
        response.push('No WebMCP tools available.');
      } else {
        const webmcpToolsMessage = data.webmcpTools
          .map(tool => {
            return `name="${tool.name}", description="${tool.description}", inputSchema=${JSON.stringify(
              tool.inputSchema,
            )}, annotations=${JSON.stringify(tool.annotations)}`;
          })
          .join('\n');
        response.push(webmcpToolsMessage);
      }
    }

    if (this.#networkRequestsOptions?.include && data.networkRequests) {
      const requests = data.networkRequests;

      response.push('## Network requests');
      if (requests.length) {
        const paginationData = this.#dataWithPagination(
          requests,
          this.#networkRequestsOptions.pagination,
        );
        structuredContent.pagination = paginationData.pagination;
        response.push(...paginationData.info);
        if (data.networkRequests) {
          structuredContent.networkRequests = paginationData.items.map(i =>
            i.toJSON(),
          );
          response.push(
            ...(compactEncode
              ? [compactEncode(structuredContent.networkRequests)]
              : paginationData.items.map(i => i.toString())),
          );
        }
      } else {
        response.push('No requests found.');
      }
    }

    if (this.#consoleDataOptions?.include) {
      const messages = data.consoleMessages ?? [];

      response.push('## Console messages');
      if (messages.length) {
        const grouped = ConsoleFormatter.groupConsecutive(messages);
        const paginationData = this.#dataWithPagination(
          grouped,
          this.#consoleDataOptions.pagination,
        );
        structuredContent.pagination = paginationData.pagination;
        structuredContent.consoleMessages = paginationData.items.map(item =>
          item.toJSON(),
        );
        response.push(...paginationData.info);
        if (compactEncode) {
          response.push(compactEncode(structuredContent.consoleMessages));
        } else {
          response.push(...paginationData.items.map(item => item.toString()));
        }
      } else {
        response.push('<no console messages found>');
      }
    }

    if (data.errorMessage) {
      response.push(`Error: ${data.errorMessage}`);
      structuredContent.errorMessage = data.errorMessage;
    }

    const text: TextContent = {
      type: 'text',
      text: response.join('\n'),
    };
    const images: ImageContent[] = this.#images.map(imageData => {
      return {
        type: 'image',
        ...imageData,
      } as const;
    });

    return {
      content: [text, ...images],
      structuredContent,
    };
  }

  #dataWithPagination<T>(data: T[], pagination?: PaginationOptions) {
    const response = [];
    const paginationResult = paginate<T>(data, pagination);
    if (paginationResult.invalidPage) {
      response.push('Invalid page number provided. Showing first page.');
    }

    const {startIndex, endIndex, currentPage, totalPages} = paginationResult;
    response.push(
      `Showing ${startIndex + 1}-${endIndex} of ${data.length} (Page ${currentPage + 1} of ${totalPages}).`,
    );
    if (pagination) {
      if (paginationResult.hasNextPage) {
        response.push(`Next page: ${currentPage + 1}`);
      }
      if (paginationResult.hasPreviousPage) {
        response.push(`Previous page: ${currentPage - 1}`);
      }
    }

    return {
      info: response,
      items: paginationResult.items,
      pagination: {
        currentPage: paginationResult.currentPage,
        totalPages: paginationResult.totalPages,
        hasNextPage: paginationResult.hasNextPage,
        hasPreviousPage: paginationResult.hasPreviousPage,
        startIndex: paginationResult.startIndex,
        endIndex: paginationResult.endIndex,
        invalidPage: paginationResult.invalidPage,
      },
    };
  }

  resetResponseLineForTesting() {
    this.#textResponseLines = [];
  }
}
function truncateTitle(title: string, maxLength = 50): string {
  if (title.length <= maxLength) {
    return title;
  }
  return title.slice(0, maxLength - 3) + '...';
}

async function fetchPageTitle(page: Page): Promise<string> {
  return Promise.race([
    page.title().catch(() => ''),
    new Promise<string>(resolve => setTimeout(() => resolve(''), 1000)),
  ]);
}

function createStructuredPage(
  mcpPage: McpPage,
  context: McpContext,
  rawTitle: string,
) {
  const isolatedContextName = mcpPage.isolatedContextName;
  const title = truncateTitle(rawTitle);
  const entry: {
    id: number | undefined;
    url: string;
    title: string;
    selected: boolean;
    isolatedContext?: string;
  } = {
    id: mcpPage.id,
    url: mcpPage.pptrPage.url(),
    title,
    selected: context.isPageSelected(mcpPage),
  };
  if (isolatedContextName) {
    entry.isolatedContext = isolatedContextName;
  }
  return entry;
}
