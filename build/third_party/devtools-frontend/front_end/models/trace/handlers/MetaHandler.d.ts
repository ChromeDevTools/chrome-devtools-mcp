import * as Types from '../types/types.js';
import type { FinalizeOptions } from './types.js';
export declare function handleUserConfig(userConfig: Types.Configuration.Configuration): void;
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(options?: FinalizeOptions): Promise<void>;
export interface MetaHandlerData {
    config: Types.Configuration.Configuration;
    traceIsGeneric: boolean;
    traceBounds: Types.Timing.TraceWindowMicro;
    browserProcessId: Types.Events.ProcessID;
    processNames: Map<Types.Events.ProcessID, Types.Events.ProcessName>;
    browserThreadId: Types.Events.ThreadID;
    gpuProcessId: Types.Events.ProcessID;
    navigationsByFrameId: Map<string, Types.Events.NavigationStart[]>;
    /**
     * This does not include soft navigations.
     *
     * TODO(crbug.com/414468047): include soft navs here, so that
     * PageLoadMetricsHandler and insights can use this map for all navigation types.
     */
    navigationsByNavigationId: Map<string, Types.Events.NavigationStart>;
    softNavigationsById: Map<number, Types.Events.SoftNavigationStart>;
    /**
     * The user-visible URL displayed to users in the address bar.
     * This captures:
     *  - resolving all redirects
     *  - history API pushState
     *
     * Given no redirects or history API usages, this is just the navigation event's documentLoaderURL.
     *
     * Note: empty string special case denotes the duration of the trace between the start
     * and the first navigation. If there is no history API navigation during this time,
     * there will be no value for empty string.
     **/
    finalDisplayUrlByNavigationId: Map<string, string>;
    threadsInProcess: Map<Types.Events.ProcessID, Map<Types.Events.ThreadID, Types.Events.ThreadName>>;
    mainFrameId: string;
    mainFrameURL: string;
    /**
     * A frame can have multiple renderer processes, at the same time,
     * a renderer process can have multiple URLs. This map tracks the
     * processes active on a given frame, with the time window in which
     * they were active. Because a renderer process might have multiple
     * URLs, each process in each frame has an array of windows, with an
     * entry for each URL it had.
     */
    rendererProcessesByFrame: FrameProcessData;
    topLevelRendererIds: Set<Types.Events.ProcessID>;
    frameByProcessId: Map<Types.Events.ProcessID, Map<string, Types.Events.TraceFrame>>;
    mainFrameNavigations: Types.Events.NavigationStart[];
    gpuThreadId?: Types.Events.ThreadID;
    viewportRect?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    devicePixelRatio?: number;
}
/**
 * Each frame has a single render process at a given time but it can have
 * multiple render processes  during a trace, for example if a navigation
 * occurred in the frame. This map tracks the process that was active for
 * each frame at each point in time. Also, because a process can be
 * assigned to multiple URLs, there is a window for each URL a process
 * was assigned.
 *
 * Note that different sites always end up in different render
 * processes, however two different URLs can point to the same site.
 * For example: https://google.com and https://maps.google.com point to
 * the same site.
 * Read more about this in
 * https://developer.chrome.com/articles/renderingng-architecture/#threads
 * and https://web.dev/same-site-same-origin/
 **/
export type FrameProcessData = Map<string, Map<Types.Events.ProcessID, Array<{
    frame: Types.Events.TraceFrame;
    window: Types.Timing.TraceWindowMicro;
}>>>;
export declare function data(): MetaHandlerData;
