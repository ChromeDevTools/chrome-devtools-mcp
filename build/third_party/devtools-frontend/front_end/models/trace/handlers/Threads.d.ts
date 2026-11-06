import type * as Helpers from '../helpers/helpers.js';
import type * as Types from '../types/types.js';
import type * as Renderer from './RendererHandler.js';
import type { HandlerData } from './types.js';
export interface ThreadData {
    pid: Types.Events.ProcessID;
    tid: Types.Events.ThreadID;
    entries: readonly Types.Events.Event[];
    processIsOnMainFrame: boolean;
    tree: Helpers.TreeHelpers.TraceEntryTree;
    type: ThreadType;
    name: string | null;
    entryToNode: Map<Types.Events.Event, Helpers.TreeHelpers.TraceEntryNode>;
}
export declare enum ThreadType {
    MAIN_THREAD = "MAIN_THREAD",
    WORKER = "WORKER",
    RASTERIZER = "RASTERIZER",
    OTHER = "OTHER",
    CPU_PROFILE = "CPU_PROFILE",
    THREAD_POOL = "THREAD_POOL"
}
export declare function threadsInRenderer(rendererData: Renderer.RendererHandlerData): readonly ThreadData[];
/**
 * Given trace parsed data, this helper will return a high level array of
 * ThreadData. This is useful because it allows you to get a list of threads
 * regardless of if the trace is a CPU Profile or a Tracing profile. Thus you
 * can use this helper to iterate over threads in confidence that it will work
 * for both trace types.
 * The resulting data is cached per-trace, so you can safely call this multiple times.
 */
export declare function threadsInTrace(handlerData: HandlerData): readonly ThreadData[];
