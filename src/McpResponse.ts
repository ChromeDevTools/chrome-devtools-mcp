/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {createStackTraceForConsoleMessage} from './DevtoolsUtils.js';
import type {ConsoleMessageData} from './formatters/consoleFormatter.js';
import {
  formatConsoleEventShort,
  formatConsoleEventVerbose,
} from './formatters/consoleFormatter.js';
import {IssueFormatter} from './formatters/IssueFormatter.js';
import {NetworkFormatter} from './formatters/NetworkFormatter.js';
import {SnapshotFormatter} from './formatters/SnapshotFormatter.js';
import type {McpContext} from './McpContext.js';
import {DevTools} from './third_party/index.js';
import type {
  ConsoleMessage,
  ImageContent,
  ResourceType,
  TextContent,
} from './third_party/index.js';
import {handleDialog} from './tools/pages.js';
import type {
  DevToolsData,
  ImageContentData,
  Response,
  SnapshotParams,
} from './tools/ToolDefinition.js';
import {paginate} from './utils/pagination.js';
import type {PaginationOptions} from './utils/types.js';

export class McpResponse implements Response {
  #includePages = false;
  #snapshotParams?: SnapshotParams;
  #attachedNetworkRequestId?: number;
  #attachedNetworkRequestOptions?: {
    requestFilePath?: string;
    responseFilePath?: string;
  };
  #attachedConsoleMessageId?: number;
  #textResponseLines: string[] = [];
  #images: ImageContentData[] = [];
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
  };
  #devToolsData?: DevToolsData;
  #tabId?: string;

  attachDevToolsData(data: DevToolsData): void {
    this.#devToolsData = data;
  }

  setTabId(tabId: string): void {
    this.#tabId = tabId;
  }

  setIncludePages(value: boolean): void {
    this.#includePages = value;
  }

  includeSnapshot(params?: SnapshotParams): void {
    this.#snapshotParams = params ?? {
      verbose: false,
    };
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
    };
  }

  attachNetworkRequest(
    reqid: number,
    options?: {requestFilePath?: string; responseFilePath?: string},
  ): void {
    this.#attachedNetworkRequestId = reqid;
    this.#attachedNetworkRequestOptions = options;
  }

  attachConsoleMessage(msgid: number): void {
    this.#attachedConsoleMessageId = msgid;
  }

  get includePages(): boolean {
    return this.#includePages;
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

  appendResponseLine(value: string): void {
    this.#textResponseLines.push(value);
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

  async handle(
    toolName: string,
    context: McpContext,
  ): Promise<{
    content: Array<TextContent | ImageContent>;
    structuredContent: object;
  }> {
    if (this.#includePages) {
      await context.createPagesSnapshot();
    }

    let snapshot: SnapshotFormatter | string | undefined;
    if (this.#snapshotParams) {
      await context.createTextSnapshot(
        this.#snapshotParams.verbose,
        this.#devToolsData,
      );
      const textSnapshot = context.getTextSnapshot();
      if (textSnapshot) {
        const formatter = new SnapshotFormatter(textSnapshot);
        if (this.#snapshotParams.filePath) {
          await context.saveFile(
            new TextEncoder().encode(formatter.toString()),
            this.#snapshotParams.filePath,
          );
          snapshot = this.#snapshotParams.filePath;
        } else {
          snapshot = formatter;
        }
      }
    }

    let detailedNetworkRequest: NetworkFormatter | undefined;
    if (this.#attachedNetworkRequestId) {
      const request = context.getNetworkRequestById(
        this.#attachedNetworkRequestId,
      );
      const formatter = await NetworkFormatter.from(request, {
        requestId: this.#attachedNetworkRequestId,
        requestIdResolver: req => context.getNetworkRequestStableId(req),
        fetchData: true,
        requestFilePath: this.#attachedNetworkRequestOptions?.requestFilePath,
        responseFilePath: this.#attachedNetworkRequestOptions?.responseFilePath,
        saveFile: (data, filename) => context.saveFile(data, filename),
      });
      detailedNetworkRequest = formatter;
    }

    let consoleData: ConsoleMessageData | IssueFormatter | undefined;

    if (this.#attachedConsoleMessageId) {
      const message = context.getConsoleMessageById(
        this.#attachedConsoleMessageId,
      );
      const consoleMessageStableId = this.#attachedConsoleMessageId;
      if ('args' in message) {
        const consoleMessage = message as ConsoleMessage;
        const devTools = context.getDevToolsUniverse();
        const stackTrace = devTools
          ? await createStackTraceForConsoleMessage(devTools, consoleMessage)
          : undefined;

        consoleData = {
          consoleMessageStableId,
          type: consoleMessage.type(),
          message: consoleMessage.text(),
          args: await Promise.all(
            consoleMessage.args().map(async arg => {
              const stringArg = await arg.jsonValue().catch(() => {
                // Ignore errors.
              });
              return typeof stringArg === 'object'
                ? JSON.stringify(stringArg)
                : String(stringArg);
            }),
          ),
          stackTrace,
        };
      } else if (message instanceof DevTools.AggregatedIssue) {
        const formatter = new IssueFormatter(message, {
          id: consoleMessageStableId,
          requestIdResolver: context.resolveCdpRequestId.bind(context),
          elementIdResolver: context.resolveCdpElementId.bind(context),
        });
        if (!formatter.isValid()) {
          throw new Error(
            "Can't provide detals for the msgid " + consoleMessageStableId,
          );
        }
        consoleData = formatter;
      } else {
        consoleData = {
          consoleMessageStableId,
          type: 'error',
          message: (message as Error).message,
          args: [],
        };
      }
    }

    let consoleListData: Array<ConsoleMessageData | IssueFormatter> | undefined;
    if (this.#consoleDataOptions?.include) {
      let messages = context.getConsoleData(
        this.#consoleDataOptions.includePreservedMessages,
      );

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

      consoleListData = (
        await Promise.all(
          messages.map(
            async (
              item,
            ): Promise<ConsoleMessageData | IssueFormatter | null> => {
              const consoleMessageStableId =
                context.getConsoleMessageStableId(item);
              if ('args' in item) {
                const consoleMessage = item as ConsoleMessage;
                const devTools = context.getDevToolsUniverse();
                const stackTrace = devTools
                  ? await createStackTraceForConsoleMessage(
                      devTools,
                      consoleMessage,
                    )
                  : undefined;
                return {
                  consoleMessageStableId,
                  type: consoleMessage.type(),
                  message: consoleMessage.text(),
                  args: await Promise.all(
                    consoleMessage.args().map(async arg => {
                      const stringArg = await arg.jsonValue().catch(() => {
                        // Ignore errors.
                      });
                      return typeof stringArg === 'object'
                        ? JSON.stringify(stringArg)
                        : String(stringArg);
                    }),
                  ),
                  stackTrace,
                };
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
              return {
                consoleMessageStableId,
                type: 'error',
                message: (item as Error).message,
                args: [],
              };
            },
          ),
        )
      ).filter(item => item !== null);
    }

    let networkRequests: NetworkFormatter[] | undefined;
    if (this.#networkRequestsOptions?.include) {
      let requests = context.getNetworkRequests(
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
        const data = this.#dataWithPagination(
          requests,
          this.#networkRequestsOptions.pagination,
        );

        networkRequests = await Promise.all(
          data.items.map(request =>
            NetworkFormatter.from(request, {
              requestId: context.getNetworkRequestStableId(request),
              selectedInDevToolsUI:
                context.getNetworkRequestStableId(request) ===
                this.#networkRequestsOptions?.networkRequestIdInDevToolsUI,
              fetchData: false,
              saveFile: (data, filename) => context.saveFile(data, filename),
            }),
          ),
        );
      }
    }

    return this.format(toolName, context, {
      consoleData,
      consoleListData,
      snapshot,
      detailedNetworkRequest,
      networkRequests,
    });
  }

  format(
    toolName: string,
    context: McpContext,
    data: {
      consoleData: ConsoleMessageData | IssueFormatter | undefined;
      consoleListData: Array<ConsoleMessageData | IssueFormatter> | undefined;
      snapshot: SnapshotFormatter | string | undefined;
      detailedNetworkRequest?: NetworkFormatter;
      networkRequests?: NetworkFormatter[];
    },
  ): {content: Array<TextContent | ImageContent>; structuredContent: object} {
    const response = [`# ${toolName} response`];
    for (const line of this.#textResponseLines) {
      response.push(line);
    }

    const networkConditions = context.getNetworkConditions();
    if (networkConditions) {
      response.push(`## Network emulation`);
      response.push(`Emulating: ${networkConditions}`);
      response.push(
        `Default navigation timeout set to ${context.getNavigationTimeout()} ms`,
      );
    }

    const cpuThrottlingRate = context.getCpuThrottlingRate();
    if (cpuThrottlingRate > 1) {
      response.push(`## CPU emulation`);
      response.push(`Emulating: ${cpuThrottlingRate}x slowdown`);
    }

    const dialog = context.getDialog();
    if (dialog) {
      const defaultValueIfNeeded =
        dialog.type() === 'prompt'
          ? ` (default value: "${dialog.defaultValue()}")`
          : '';
      response.push(`# Open dialog
${dialog.type()}: ${dialog.message()}${defaultValueIfNeeded}.
Call ${handleDialog.name} to handle it before continuing.`);
    }

    if (this.#includePages) {
      const parts = [`## Pages`];
      for (const page of context.getPages()) {
        parts.push(
          `${context.getPageId(page)}: ${page.url()}${context.isPageSelected(page) ? ' [selected]' : ''}`,
        );
      }
      response.push(...parts);
    }

    const structuredContent: {
      snapshot?: object;
      snapshotFilePath?: string;
      tabId?: string;
      networkRequest?: object;
      networkRequests?: object[];
    } = {};

    if (this.#tabId) {
      structuredContent.tabId = this.#tabId;
    }

    if (data.snapshot) {
      if (typeof data.snapshot === 'string') {
        response.push(`Saved snapshot to ${data.snapshot}.`);
        structuredContent.snapshotFilePath = data.snapshot;
      } else {
        response.push('## Latest page snapshot');
        response.push(data.snapshot.toString());
        structuredContent.snapshot = data.snapshot.toJSON();
      }
    }

    if (data.detailedNetworkRequest) {
      response.push(data.detailedNetworkRequest.toStringDetailed());
      structuredContent.networkRequest =
        data.detailedNetworkRequest.toJSONDetailed();
    }
    response.push(...this.#formatConsoleData(context, data.consoleData));

    if (this.#networkRequestsOptions?.include) {
      let requests = context.getNetworkRequests(
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

      response.push('## Network requests');
      if (requests.length) {
        const paginationData = this.#dataWithPagination(
          requests,
          this.#networkRequestsOptions.pagination,
        );
        response.push(...paginationData.info);
        if (data.networkRequests) {
          structuredContent.networkRequests = [];
          for (const formatter of data.networkRequests) {
            response.push(formatter.toString());
            structuredContent.networkRequests.push(formatter.toJSON());
          }
        }
      } else {
        response.push('No requests found.');
      }
    }

    if (this.#consoleDataOptions?.include) {
      const messages = data.consoleListData ?? [];

      response.push('## Console messages');
      if (messages.length) {
        const data = this.#dataWithPagination(
          messages,
          this.#consoleDataOptions.pagination,
        );
        response.push(...data.info);
        response.push(
          ...data.items.map(message => {
            if (message instanceof IssueFormatter) {
              return message.toString();
            }
            return formatConsoleEventShort(message);
          }),
        );
      } else {
        response.push('<no console messages found>');
      }
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
    };
  }

  #formatConsoleData(
    context: McpContext,
    data: ConsoleMessageData | IssueFormatter | undefined,
  ): string[] {
    const response: string[] = [];
    if (!data) {
      return response;
    }

    if (data instanceof IssueFormatter) {
      response.push(data.toStringDetailed());
    } else {
      response.push(formatConsoleEventVerbose(data, context));
    }
    return response;
  }

  resetResponseLineForTesting() {
    this.#textResponseLines = [];
  }
}
