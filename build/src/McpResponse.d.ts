/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { WebMCPTool } from 'puppeteer-core';
import type { ReadonlyServerConfig } from './config/ServerConfig.js';
import { CommentFormatter } from './formatters/CommentFormatter.js';
import { ConsoleFormatter } from './formatters/ConsoleFormatter.js';
import { type CssFormatterOptions } from './formatters/CssFormatter.js';
import { type ContextFilterOptions, type HeapSnapshotFormatOptions } from './formatters/HeapSnapshotFormatter.js';
import { IssueFormatter } from './formatters/IssueFormatter.js';
import { NetworkFormatter } from './formatters/NetworkFormatter.js';
import { SnapshotFormatter } from './formatters/SnapshotFormatter.js';
import type { HeapSnapshotAggregateData, HeapSnapshotDetailedClassDiff, HeapSnapshotDiff, DuplicateStringGroup } from './processors/HeapSnapshotManager.js';
import type { McpContext } from './McpContext.js';
import type { McpPage } from './McpPage.js';
import { UncaughtError } from './collectors/PageCollector.js';
import { DevTools, type ConsoleMessage, type ImageContent, type ResourceType, type TextContent, type Extension, type HTTPRequest } from './third_party/index.js';
import type { ToolGroups } from './tools/thirdPartyDeveloper.js';
import type { DevToolsData, ImageContentData, LighthouseData, MatchedStyles, Response, SnapshotParams } from './tools/ToolDefinition.js';
import { type InsightName, type TraceResult } from './processors/PerformanceTrace.js';
import type { CD4ACommentThread, PaginationOptions } from './types.js';
import type { WaitForEventsResult } from './utils/WaitForHelper.js';
export type DataFormat = 'default' | 'toon' | 'gcf';
interface TraceInsightData {
    trace: TraceResult;
    insightSetId: string;
    insightName: InsightName;
}
interface ContextAnalysisOptions extends PaginationOptions, ContextFilterOptions, HeapSnapshotFormatOptions {
}
export declare class McpResponse implements Response {
    #private;
    constructor(config: ReadonlyServerConfig);
    setPage(page: McpPage): void;
    /**
     * Surfaces a one-time note that the browser reconnected and page ids changed.
     * Set by the tool handler when the context reports a pending reconnect notice.
     */
    setReconnectNotice(): void;
    attachDevToolsData(data: DevToolsData): void;
    setTabId(tabId: string): void;
    setIncludePages(value: boolean): void;
    setIncludeExtensionServiceWorkers(value: boolean): void;
    includeSnapshot(params?: SnapshotParams): void;
    setListExtensions(): void;
    setListThirdPartyDeveloperTools(): void;
    setListWebMcpTools(): void;
    setIncludeNetworkRequests(value: boolean, options?: PaginationOptions & {
        resourceTypes?: ResourceType[];
        includePreservedRequests?: boolean;
        networkRequestIdInDevToolsUI?: number;
    }): void;
    setIncludeConsoleData(value: boolean, options?: PaginationOptions & {
        types?: string[];
        includePreservedMessages?: boolean;
        includeStackTraces?: boolean;
        serviceWorkerId?: string;
    }): void;
    setIncludeCssStyles(matchedStyles: MatchedStyles, options: CssFormatterOptions & PaginationOptions): void;
    setError(error: Error): void;
    attachNetworkRequest(reqId: number, options?: {
        requestFilePath?: string;
        responseFilePath?: string;
    }): void;
    attachConsoleMessage(msgid: number): void;
    attachTraceSummary(result: TraceResult): void;
    attachTraceInsight(trace: TraceResult, insightSetId: string, insightName: InsightName): void;
    attachLighthouseResult(result: LighthouseData): void;
    get includePages(): boolean;
    get attachedTraceSummary(): TraceResult | undefined;
    get attachedTracedInsight(): TraceInsightData | undefined;
    get attachedLighthouseResult(): LighthouseData | undefined;
    get includeNetworkRequests(): boolean;
    get includeConsoleData(): boolean;
    get attachedNetworkRequestId(): number | undefined;
    get networkRequestsPageIdx(): number | undefined;
    get consoleMessagesPageIdx(): number | undefined;
    get consoleMessagesTypes(): string[] | undefined;
    get error(): Error | undefined;
    appendResponseLine(value: string): void;
    attachWaitForResult(result: WaitForEventsResult): void;
    setDevToolsComments(threads: CD4ACommentThread[]): void;
    get devToolsComments(): readonly CD4ACommentThread[] | undefined;
    setHeapSnapshotAggregates(aggregateData: HeapSnapshotAggregateData, options?: PaginationOptions & HeapSnapshotFormatOptions): void;
    setHeapSnapshotStats(stats: DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics, staticData: DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null, nativeContextSizes: DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes, retainedByContextSummary: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary, options?: HeapSnapshotFormatOptions): void;
    setHeapSnapshotNodes(nodes: DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange, options?: PaginationOptions & HeapSnapshotFormatOptions): void;
    setHeapSnapshotDuplicateStrings(duplicateStrings: DuplicateStringGroup[], options?: PaginationOptions & HeapSnapshotFormatOptions): void;
    setHeapSnapshotRetainingPaths(retainingPaths: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths, options?: HeapSnapshotFormatOptions): void;
    setHeapSnapshotDominators(dominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain, options?: HeapSnapshotFormatOptions): void;
    setHeapSnapshotClassDiffs(diff: HeapSnapshotDiff, options?: PaginationOptions & HeapSnapshotFormatOptions): void;
    setHeapSnapshotDetailedClassDiff(detailedClassDiff: HeapSnapshotDetailedClassDiff, options?: PaginationOptions & HeapSnapshotFormatOptions): void;
    setHeapSnapshotObjectDetails(objectInfo: DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo, options?: HeapSnapshotFormatOptions): void;
    setHeapSnapshotContextAnalysis(contextAnalysis: DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult, options?: ContextAnalysisOptions): void;
    attachImage(value: ImageContentData): void;
    get responseLines(): readonly string[];
    get images(): ImageContentData[];
    get snapshotParams(): SnapshotParams | undefined;
    get listWebMcpTools(): boolean | undefined;
    handle(context: McpContext, dataFormat?: DataFormat): Promise<{
        content: Array<TextContent | ImageContent>;
        structuredContent: object;
    }>;
    getConsoleMessageStableId(message: ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError): number;
    getNetworkRequestStableId(request: HTTPRequest): number;
    format(context: McpContext, data: {
        detailedConsoleMessage: ConsoleFormatter | IssueFormatter | undefined;
        consoleMessages: Array<ConsoleFormatter | IssueFormatter> | undefined;
        snapshot: SnapshotFormatter | string | undefined;
        detailedNetworkRequest?: NetworkFormatter;
        networkRequests?: NetworkFormatter[];
        traceSummary?: TraceResult;
        traceInsight?: TraceInsightData;
        extensions?: Map<string, Extension>;
        lighthouseResult?: LighthouseData;
        thirdPartyDeveloperTools?: ToolGroups;
        webmcpTools?: WebMCPTool[];
        comments?: CommentFormatter;
        commentsSnapshotRegenerated?: 'standard' | 'verbose';
        errorMessage?: string;
    }, dataFormat?: DataFormat): Promise<{
        content: Array<TextContent | ImageContent>;
        structuredContent: object;
    }>;
    resetResponseLineForTesting(): void;
}
export {};
