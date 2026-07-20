/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {WebMCPTool} from 'puppeteer-core';

import type {
  HeapSnapshotClassDiff,
  HeapSnapshotDetailedClassDiff,
  DuplicateStringGroup,
} from '../HeapSnapshotManager.js';
import type {McpContext} from '../McpContext.js';
import type {McpPage} from '../McpPage.js';
import type {
  ConsoleDataOptions,
  HeapSnapshotOptions,
  NetworkRequestsOptions,
  TraceInsightData,
} from '../McpResponse.js';
import {DevTools} from '../third_party/index.js';
import type {
  Extension,
  ImageContent,
  TextContent,
} from '../third_party/index.js';
import {listPages, handleDialog} from '../tools/pages.js';
import type {ToolGroups} from '../tools/thirdPartyDeveloper.js';
import type {
  ImageContentData,
  LighthouseData,
} from '../tools/ToolDefinition.js';
import type {TraceResult} from '../trace-processing/parse.js';
import {getInsightOutput, getTraceSummary} from '../trace-processing/parse.js';
import type {PaginationOptions} from '../types.js';
import {paginate} from '../utils/pagination.js';
import type {WaitForEventsResult} from '../WaitForHelper.js';

import {ConsoleFormatter} from './ConsoleFormatter.js';
import {
  HeapSnapshotFormatter,
  isEdgeLike,
  isNodeLike,
} from './HeapSnapshotFormatter.js';
import type {IssueFormatter} from './IssueFormatter.js';
import type {NetworkFormatter} from './NetworkFormatter.js';
import type {SnapshotFormatter} from './SnapshotFormatter.js';

const {formatBytesToKb} = DevTools.I18n.ByteUtilities;

export interface FormatData {
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
  pageTitles: Map<number, string>;
  compactEncode?: (val: unknown) => string;
}

export interface FormatState {
  reconnectNotice: boolean;
  textResponseLines: readonly string[];
  attachedWaitForResult?: WaitForEventsResult;
  page?: McpPage;
  includePages: boolean;
  includeExtensionPages: boolean;
  includeExtensionServiceWorkers: boolean;
  tabId?: string;
  deviceScope: DevTools.CrUXManager.DeviceScope;
  heapSnapshotOptions?: HeapSnapshotOptions;
  listWebMcpTools?: boolean;
  networkRequestsOptions?: NetworkRequestsOptions;
  consoleDataOptions?: ConsoleDataOptions;
  images: ImageContentData[];
}

export class McpResponseFormatter {
  static format(
    toolName: string,
    context: McpContext,
    data: FormatData,
    state: FormatState,
  ): {
    content: Array<TextContent | ImageContent>;
    structuredContent: object;
  } {
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
      reconnected?: boolean;
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
        nativeContextSizes?: object;
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
      heapSnapshotObjectDetails?: DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo;
      extensionServiceWorkers?: object[];
      extensionPages?: object[];
      errorMessage?: string;
      navigatedToUrl?: string;
      geolocation?: {latitude: number; longitude: number};
    } = {};

    const compactEncode = data.compactEncode;

    const response = [];
    if (state.reconnectNotice) {
      structuredContent.reconnected = true;
      response.push(
        `Note: the browser was restarted or reconnected since the last call. Page ids have changed. Call ${listPages().name} to see open pages.`,
      );
    }
    if (state.textResponseLines.length) {
      structuredContent.message = state.textResponseLines.join('\n');
      response.push(...state.textResponseLines);
    }

    if (state.attachedWaitForResult) {
      if (state.attachedWaitForResult.navigatedToUrl) {
        response.push(
          `Page navigated to ${state.attachedWaitForResult.navigatedToUrl}.`,
        );
        structuredContent.navigatedToUrl =
          state.attachedWaitForResult.navigatedToUrl;
      }
    }

    const networkConditions = state.page?.networkConditions;
    if (networkConditions) {
      const timeout = state.page!.pptrPage.getDefaultNavigationTimeout();
      response.push(`Emulating network conditions: ${networkConditions}`);
      response.push(`Default navigation timeout set to ${timeout} ms`);
      structuredContent.networkConditions = networkConditions;
      structuredContent.navigationTimeout = timeout;
    }

    const geolocation = state.page?.geolocation;
    if (geolocation) {
      response.push(
        `Emulating geolocation: latitude=${geolocation.latitude}, longitude=${geolocation.longitude}`,
      );
      structuredContent.geolocation = geolocation;
    }

    const viewport = state.page?.viewport;
    if (viewport) {
      response.push(`Emulating viewport: ${JSON.stringify(viewport)}`);
      structuredContent.viewport = viewport;
    }

    const userAgent = state.page?.userAgent;
    if (userAgent) {
      response.push(`Emulating user agent: ${userAgent}`);
      structuredContent.userAgent = userAgent;
    }

    const cpuThrottlingRate = state.page?.cpuThrottlingRate ?? 1;
    if (cpuThrottlingRate > 1) {
      response.push(`Emulating CPU throttling: ${cpuThrottlingRate}x slowdown`);
      structuredContent.cpuThrottlingRate = cpuThrottlingRate;
    }

    const colorScheme = state.page?.colorScheme;
    if (colorScheme) {
      response.push(`Emulating color scheme: ${colorScheme}`);
      structuredContent.colorScheme = colorScheme;
    }

    const dialog = state.page?.getDialog();
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

    if (state.includePages) {
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
          const title = data.pageTitles.get(mcpPage.id as number) ?? '';
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

      if (state.includeExtensionPages) {
        if (extensionPages.length) {
          response.push(`## Extension Pages`);
          const structuredExtensionPages = [];
          for (const mcpPage of extensionPages) {
            const isolatedContextName = mcpPage.isolatedContextName;
            const contextLabel = isolatedContextName
              ? ` isolatedContext=${isolatedContextName}`
              : '';
            const title = data.pageTitles.get(mcpPage.id as number) ?? '';
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

    if (state.includeExtensionServiceWorkers) {
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

    if (state.tabId) {
      structuredContent.tabId = state.tabId;
    }

    if (data.traceSummary) {
      const summary = getTraceSummary(data.traceSummary, state.deviceScope);
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
        state.deviceScope,
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

    if (state.heapSnapshotOptions?.include) {
      response.push('## Heap Snapshot Data');
      const stats = state.heapSnapshotOptions.stats;
      const staticData = state.heapSnapshotOptions.staticData;
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
      const nativeContextSizes = state.heapSnapshotOptions.nativeContextSizes;
      if (nativeContextSizes) {
        response.push('### Native Contexts');
        response.push(
          HeapSnapshotFormatter.formatNativeContextSizes(nativeContextSizes),
        );
        structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
        structuredContent.heapSnapshot.nativeContextSizes = nativeContextSizes;
      }
      const aggregateData = state.heapSnapshotOptions.aggregateData;
      if (aggregateData) {
        const sortedEntries = HeapSnapshotFormatter.sort(
          aggregateData.aggregates,
        );

        const paginationData = McpResponseFormatter.dataWithPagination(
          sortedEntries,
          state.heapSnapshotOptions.pagination,
        );

        response.push(`Objects: ${aggregateData.objectCount}`);
        response.push(
          `Total shallow size: ${formatBytesToKb(aggregateData.totalSelfSize)}`,
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
      const nodes = state.heapSnapshotOptions.nodes;
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

        const paginationData = McpResponseFormatter.dataWithPagination(
          items,
          state.heapSnapshotOptions.pagination,
        );

        response.push(HeapSnapshotFormatter.formatNodes(paginationData.items));

        structuredContent.pagination = paginationData.pagination;
        response.push(...paginationData.info);

        structuredContent.heapSnapshotNodes = paginationData.items;
      }
      const retainingPaths = state.heapSnapshotOptions.retainingPaths;
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
      const dominators = state.heapSnapshotOptions.dominators;
      if (dominators) {
        response.push('### Dominator Chain');
        if (dominators.length === 0) {
          response.push('No dominators found.');
        } else {
          response.push(HeapSnapshotFormatter.formatDominators(dominators));
        }
        structuredContent.heapSnapshotDominators = dominators;
      }
      const classDiffs = state.heapSnapshotOptions.classDiffs;
      if (classDiffs) {
        response.push('### Heap Snapshot Diff');
        response.push(
          compactEncode
            ? compactEncode(classDiffs)
            : HeapSnapshotFormatter.formatDiffSummary(classDiffs),
        );
        structuredContent.heapSnapshotClassDiffs = classDiffs;
      }
      const detailedClassDiff = state.heapSnapshotOptions.detailedClassDiff;
      if (detailedClassDiff) {
        response.push('### Heap Snapshot Detailed Diff');
        response.push(
          compactEncode
            ? compactEncode(detailedClassDiff)
            : HeapSnapshotFormatter.formatDiffDetails(detailedClassDiff),
        );
        structuredContent.heapSnapshotDetailedClassDiff = detailedClassDiff;
      }
      const duplicateStrings = state.heapSnapshotOptions.duplicateStrings;
      if (duplicateStrings) {
        response.push('### Duplicate Strings');
        const paginationData = McpResponseFormatter.dataWithPagination(
          duplicateStrings,
          state.heapSnapshotOptions.pagination,
        );

        structuredContent.pagination = paginationData.pagination;
        response.push(...paginationData.info);

        const formatted = HeapSnapshotFormatter.formatDuplicateStrings(
          paginationData.items,
        );
        response.push(formatted);

        structuredContent.heapSnapshotDuplicateStrings = paginationData.items;
      }
      const objectInfo = state.heapSnapshotOptions.objectInfo;
      if (objectInfo) {
        response.push('### Object Details');
        response.push(
          compactEncode
            ? compactEncode(objectInfo)
            : HeapSnapshotFormatter.formatObjectInfo(objectInfo),
        );
        structuredContent.heapSnapshotObjectDetails = objectInfo;
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

    if (state.listWebMcpTools && data.webmcpTools) {
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

    if (state.networkRequestsOptions?.include && data.networkRequests) {
      const requests = data.networkRequests;

      response.push('## Network requests');
      if (requests.length) {
        const paginationData = McpResponseFormatter.dataWithPagination(
          requests,
          state.networkRequestsOptions.pagination,
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

    if (state.consoleDataOptions?.include) {
      const messages = data.consoleMessages ?? [];

      response.push('## Console messages');
      if (messages.length) {
        const grouped = ConsoleFormatter.groupConsecutive(messages);
        const paginationData = McpResponseFormatter.dataWithPagination(
          grouped,
          state.consoleDataOptions.pagination,
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
    const images: ImageContent[] = state.images.map(imageData => {
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

  static dataWithPagination<T>(data: T[], pagination?: PaginationOptions) {
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
}

function truncateTitle(title: string, maxLength = 50): string {
  if (title.length <= maxLength) {
    return title;
  }
  return title.slice(0, maxLength - 3) + '...';
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
