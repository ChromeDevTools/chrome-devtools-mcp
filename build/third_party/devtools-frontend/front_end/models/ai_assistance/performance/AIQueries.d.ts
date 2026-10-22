import * as Trace from '../../../models/trace/trace.js';
import { AICallTree } from './AICallTree.js';
export declare class AIQueries {
    static findMainThread(navigationId: string | undefined, parsedTrace: Trace.TraceModel.ParsedTrace): Trace.Handlers.Threads.ThreadData | null;
    /**
     * Returns bottom up activity for the given range (within a single navigation / thread).
     */
    static mainThreadActivityBottomUpSingleNavigation(navigationId: string | undefined, bounds: Trace.Types.Timing.TraceWindowMicro, parsedTrace: Trace.TraceModel.ParsedTrace): Trace.Extras.TraceTree.BottomUpRootNode | null;
    /**
     * Returns bottom up activity for the given range (no matter the navigation / thread).
     */
    static mainThreadActivityBottomUp(bounds: Trace.Types.Timing.TraceWindowMicro, parsedTrace: Trace.TraceModel.ParsedTrace): Trace.Extras.TraceTree.BottomUpRootNode | null;
    /**
     * Returns an AI Call Tree representing the activity on the main thread for
     * the relevant time range of the given insight.
     */
    static mainThreadActivityTopDown(navigationId: string | undefined, bounds: Trace.Types.Timing.TraceWindowMicro, parsedTrace: Trace.TraceModel.ParsedTrace): AICallTree | null;
    /**
     * Returns the top longest tasks as AI Call Trees.
     */
    static longestTasks(navigationId: string | undefined, bounds: Trace.Types.Timing.TraceWindowMicro, parsedTrace: Trace.TraceModel.ParsedTrace, limit?: number): AICallTree[] | null;
}
