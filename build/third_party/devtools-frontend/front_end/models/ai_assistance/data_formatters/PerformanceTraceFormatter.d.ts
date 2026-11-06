import type * as Platform from '../../../core/platform/platform.js';
import * as CrUXManager from '../../crux-manager/crux-manager.js';
import type * as SourceMapScopes from '../../source_map_scopes/source_map_scopes.js';
import * as Trace from '../../trace/trace.js';
import type { AICallTree } from '../performance/AICallTree.js';
import type { AgentFocus } from '../performance/AIContext.js';
export interface NetworkRequestFormatOptions {
    verbose?: boolean;
    customTitle?: string;
}
export declare class PerformanceTraceFormatter {
    #private;
    resolveFunctionCode?: (url: Platform.DevToolsPath.UrlString, line: number, column: number) => Promise<SourceMapScopes.FunctionCodeResolver.FunctionCode | null>;
    constructor(focus: AgentFocus, deviceScope?: CrUXManager.DeviceScope | null, cruxManager?: CrUXManager.CrUXManager);
    serializeEvent(event: Trace.Types.Events.Event): string;
    serializeBounds(bounds: Trace.Types.Timing.TraceWindowMicro): string;
    formatTraceSummary(): string;
    formatCriticalRequests(): Promise<string>;
    formatMainThreadBottomUpSummary(): Promise<string>;
    formatThirdPartySummary(): Promise<string>;
    formatLongestTasks(): Promise<string>;
    formatMainThreadTrackSummary(bounds: Trace.Types.Timing.TraceWindowMicro): Promise<string>;
    formatNetworkTrackSummary(bounds: Trace.Types.Timing.TraceWindowMicro): string;
    formatExtensionTrackSummary(bounds: Trace.Types.Timing.TraceWindowMicro): string;
    formatCallTree(tree: AICallTree, headerLevel?: number): Promise<string>;
    formatRequestUrl(request: Trace.Types.Events.SyntheticNetworkRequest): string;
    formatNetworkRequests(requests: readonly Trace.Types.Events.SyntheticNetworkRequest[], options?: NetworkRequestFormatOptions): string;
    static callFrameDataFormatDescription: string;
    /**
     * Network requests format description that is sent to the model as a fact.
     */
    static networkDataFormatDescription: string;
    resolveFunctionCodeAtLocation(url: Platform.DevToolsPath.UrlString, line: number, column: number): Promise<SourceMapScopes.FunctionCodeResolver.FunctionCode | null>;
    formatFunctionCode(code: SourceMapScopes.FunctionCodeResolver.FunctionCode): string;
}
/**
 * Serializes a trace event to a JSON string for AI consumption,
 * ensuring sensitive data (like headers and raw script source code)
 * is sanitized or redacted.
 */
export declare function formatEventForAI(event: Trace.Types.Events.Event, parsedTrace: Trace.TraceModel.ParsedTrace): string;
