import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import * as HandlerHelpers from './helpers.js';
import { type FrameProcessData } from './MetaHandler.js';
import type { HandlerName } from './types.js';
export declare function handleUserConfig(userConfig: Types.Configuration.Configuration): void;
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): RendererHandlerData;
/**
 * Steps through all the renderer processes we've located so far in the meta
 * handler, obtaining their URL, checking whether they are the main frame, and
 * collecting each one of their threads' name. This meta handler's data is
 * assigned to the renderer handler's data.
 */
export declare function assignMeta(processes: Map<Types.Events.ProcessID, RendererProcess>, mainFrameId: string, rendererProcessesByFrame: FrameProcessData, threadsInProcess: Map<Types.Events.ProcessID, Map<Types.Events.ThreadID, Types.Events.ThreadName>>): void;
/**
 * Assigns origins to all threads in all processes.
 * @see assignMeta
 */
export declare function assignOrigin(processes: Map<Types.Events.ProcessID, RendererProcess>, rendererProcessesByFrame: FrameProcessData): void;
/**
 * Assigns whether or not a thread is the main frame to all threads in all processes.
 * @see assignMeta
 */
export declare function assignIsMainFrame(processes: Map<Types.Events.ProcessID, RendererProcess>, mainFrameId: string, rendererProcessesByFrame: FrameProcessData): void;
/**
 * Assigns the thread name to all threads in all processes.
 * @see assignMeta
 */
export declare function assignThreadName(processes: Map<Types.Events.ProcessID, RendererProcess>, threadsInProcess: Map<Types.Events.ProcessID, Map<Types.Events.ThreadID, Types.Events.ThreadName>>): void;
/**
 * Removes unneeded trace data opportunistically stored while handling events.
 * This currently does the following:
 *  - Deletes processes with an unknown origin.
 */
export declare function sanitizeProcesses(processes: Map<Types.Events.ProcessID, RendererProcess>): void;
/**
 * Removes unneeded trace data opportunistically stored while handling events.
 * This currently does the following:
 *  - Deletes threads with no roots.
 */
export declare function sanitizeThreads(processes: Map<Types.Events.ProcessID, RendererProcess>): void;
/**
 * Creates a hierarchical structure from the trace events. Each thread in each
 * process will contribute to their own individual hierarchy.
 *
 * The trace data comes in as a contiguous array of events, against which we
 * make a couple of assumptions:
 *
 *  1. Events are temporally-ordered in terms of start time (though they're
 *     not necessarily ordered as such in the data stream).
 *  2. If event B's start and end times are within event A's time boundaries
 *     we assume that A is the parent of B.
 *
 * Therefore we expect to reformulate something like:
 *
 * [ Task A ][ Task B ][ Task C ][ Task D ][ Task E ]
 *
 * Into something hierarchically-arranged like below:
 *
 * |------------- Task A -------------||-- Task E --|
 *  |-- Task B --||-- Task D --|
 *   |- Task C -|
 */
export declare function buildHierarchy(processes: Map<Types.Events.ProcessID, RendererProcess>, options?: {
    filter: {
        has: (name: Types.Events.Name) => boolean;
    };
}): void;
export declare function makeCompleteEvent(event: Types.Events.Begin | Types.Events.End): Types.Events.SyntheticComplete | null;
export declare function deps(): HandlerName[];
export interface RendererHandlerData {
    processes: Map<Types.Events.ProcessID, RendererProcess>;
    /**
     * A map of all compositor workers (which we show in the UI as Rasterizers)
     * by the process ID.
     */
    compositorTileWorkers: Map<Types.Events.ProcessID, Types.Events.ThreadID[]>;
    entryToNode: Map<Types.Events.Event, Helpers.TreeHelpers.TraceEntryNode>;
    entityMappings: HandlerHelpers.EntityMappings;
}
export interface RendererProcess {
    url: string | null;
    isOnMainFrame: boolean;
    threads: Map<Types.Events.ThreadID, RendererThread>;
}
export interface RendererThread {
    name: string | null;
    /**
     * Contains trace events and synthetic profile calls made from
     * samples.
     */
    entries: Types.Events.Event[];
    profileCalls: Types.Events.SyntheticProfileCall[];
    layoutEvents: Types.Events.Layout[];
    recalcStyleEvents: Types.Events.RecalcStyle[];
    tree?: Helpers.TreeHelpers.TraceEntryTree;
}
