/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {WebMCPTool} from 'puppeteer-core';

import type {ParsedArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import {ConsoleFormatter} from './formatters/ConsoleFormatter.js';
import {IssueFormatter} from './formatters/IssueFormatter.js';
import type {
  FormatData,
  FormatState,
} from './formatters/McpResponseFormatter.js';
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
import {DevTools, getToonEncode, getGcfEncode} from './third_party/index.js';
import type {
  ConsoleMessage,
  Page,
  ResourceType,
  Extension,
  HTTPRequest,
} from './third_party/index.js';
import type {ToolGroups} from './tools/thirdPartyDeveloper.js';
import type {
  DevToolsData,
  ImageContentData,
  LighthouseData,
  Response,
  SnapshotParams,
} from './tools/ToolDefinition.js';
import type {InsightName, TraceResult} from './trace-processing/parse.js';
import type {PaginationOptions} from './types.js';
import type {WithSymbolId} from './utils/id.js';
import {stableIdSymbol} from './utils/id.js';
import type {WaitForEventsResult} from './WaitForHelper.js';

export type DataFormat = 'default' | 'toon' | 'gcf';

export interface TraceInsightData {
  trace: TraceResult;
  insightSetId: string;
  insightName: InsightName;
}

export interface HeapSnapshotOptions {
  include: boolean;
  aggregateData?: HeapSnapshotAggregateData;
  pagination?: PaginationOptions;
  stats?: DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics;
  staticData?: DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null;
  nativeContextSizes?: DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes;
  nodes?: DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange;
  retainingPaths?: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths;
  dominators?: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain;
  classDiffs?: HeapSnapshotClassDiff[];
  detailedClassDiff?: HeapSnapshotDetailedClassDiff;
  duplicateStrings?: DuplicateStringGroup[];
  objectInfo?: DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo;
}

export interface NetworkRequestsOptions {
  include: boolean;
  pagination?: PaginationOptions;
  resourceTypes?: ResourceType[];
  includePreservedRequests?: boolean;
  networkRequestIdInDevToolsUI?: number;
}

export interface ConsoleDataOptions {
  include: boolean;
  pagination?: PaginationOptions;
  types?: string[];
  includePreservedMessages?: boolean;
  serviceWorkerId?: string;
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
  #heapSnapshotOptions?: HeapSnapshotOptions;
  #networkRequestsOptions?: NetworkRequestsOptions;
  #consoleDataOptions?: ConsoleDataOptions;
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
  #reconnectNotice = false;

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

  /**
   * Surfaces a one-time note that the browser reconnected and page ids changed.
   * Set by the tool handler when the context reports a pending reconnect notice.
   */
  setReconnectNotice(): void {
    this.#reconnectNotice = true;
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

  get listThirdPartyDeveloperTools(): boolean {
    return this.#listThirdPartyDeveloperTools ?? false;
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
        options?.pageSize !== undefined || options?.pageIdx !== undefined
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
        options?.pageSize !== undefined || options?.pageIdx !== undefined
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
    nativeContextSizes: DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      stats,
      staticData,
      nativeContextSizes,
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

  setHeapSnapshotObjectDetails(
    objectInfo: DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo,
  ) {
    this.#heapSnapshotOptions = {
      ...this.#heapSnapshotOptions,
      include: true,
      objectInfo,
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
    context: McpContext,
    dataFormat: DataFormat = 'default',
  ): Promise<{
    data: FormatData;
    state: FormatState;
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
        requestIdResolver: req => this.getNetworkRequestStableId(req),
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
        const devTools = this.#page.devtoolsUniverse;
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
      thirdPartyDeveloperTools = await this.#page.getToolGroups();
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
              const consoleMessageStableId =
                this.getConsoleMessageStableId(item);
              if ('args' in item || item instanceof UncaughtError) {
                const consoleMessage = item as ConsoleMessage | UncaughtError;
                return await ConsoleFormatter.from(consoleMessage, {
                  id: consoleMessageStableId,
                  fetchDetailedData: false,
                  devTools: page ? page.devtoolsUniverse : undefined,
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
              requestId: this.getNetworkRequestStableId(request),
              selectedInDevToolsUI:
                this.getNetworkRequestStableId(request) ===
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

    const pageTitles = new Map<number, string>();
    if (this.#includePages) {
      for (const mcpPage of context.getPages()) {
        if (mcpPage.id !== undefined) {
          pageTitles.set(mcpPage.id, await fetchPageTitle(mcpPage.pptrPage));
        }
      }
    }

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

    return {
      data: {
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
        pageTitles,
        compactEncode,
      },
      state: {
        reconnectNotice: this.#reconnectNotice,
        textResponseLines: this.#textResponseLines,
        attachedWaitForResult: this.#attachedWaitForResult,
        page: this.#page,
        includePages: this.#includePages,
        includeExtensionPages: this.#includeExtensionPages,
        includeExtensionServiceWorkers: this.#includeExtensionServiceWorkers,
        tabId: this.#tabId,
        deviceScope: this.#deviceScope,
        heapSnapshotOptions: this.#heapSnapshotOptions,
        listWebMcpTools: this.#listWebMcpTools,
        networkRequestsOptions: this.#networkRequestsOptions,
        consoleDataOptions: this.#consoleDataOptions,
        images: this.#images,
      },
    };
  }

  getConsoleMessageStableId(
    message: ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError,
  ): number {
    return (message as WithSymbolId<typeof message>)[stableIdSymbol] ?? -1;
  }

  getNetworkRequestStableId(request: HTTPRequest): number {
    return (request as WithSymbolId<typeof request>)[stableIdSymbol] ?? -1;
  }

  resetResponseLineForTesting() {
    this.#textResponseLines = [];
  }
}

async function fetchPageTitle(page: Page): Promise<string> {
  return Promise.race([
    page.title().catch(() => ''),
    new Promise<string>(resolve => setTimeout(() => resolve(''), 1000)),
  ]);
}
