import type * as Platform from '../../../core/platform/platform.js';
import type * as SDK from '../../../core/sdk/sdk.js';
import type * as Protocol from '../../../generated/protocol.js';
import type { Micro, Milli, Seconds, TraceWindowMicro } from './Timing.js';
/** Trace Events. **/
export declare enum Phase {
    BEGIN = "B",
    END = "E",
    COMPLETE = "X",
    INSTANT = "I",
    COUNTER = "C",
    ASYNC_NESTABLE_START = "b",
    ASYNC_NESTABLE_INSTANT = "n",
    ASYNC_NESTABLE_END = "e",
    ASYNC_STEP_INTO = "T",
    ASYNC_BEGIN = "S",
    ASYNC_END = "F",
    ASYNC_STEP_PAST = "p",
    FLOW_START = "s",
    FLOW_STEP = "t",
    FLOW_END = "f",
    SAMPLE = "P",
    OBJECT_CREATED = "N",
    OBJECT_SNAPSHOT = "O",
    OBJECT_DESTROYED = "D",
    METADATA = "M",
    MEMORY_DUMP_GLOBAL = "V",
    MEMORY_DUMP_PROCESS = "v",
    MARK = "R",
    CLOCK_SYNC = "c"
}
export declare function isNestableAsyncPhase(phase: Phase): boolean;
export declare function isPhaseAsync(phase: Phase): boolean;
export declare function isFlowPhase(phase: Phase): boolean;
export declare enum Scope {
    THREAD = "t",
    PROCESS = "p",
    GLOBAL = "g"
}
export interface Event {
    args?: Args;
    cat: string;
    name: string;
    ph: Phase;
    pid: ProcessID;
    tid: ThreadID;
    tts?: Micro;
    ts: Micro;
    tdur?: Micro;
    dur?: Micro;
}
export declare function objectIsEvent(obj: object): obj is Event;
/**
 * Base `args` payload for trace events.
 *
 * Do not add event-specific properties or catch-all `data` bags here; define
 * them on individual event interfaces instead.
 */
export interface Args {
}
export interface CallFrame {
    codeType?: string;
    functionName: string;
    scriptId: number | string;
    columnNumber: number;
    lineNumber: number;
    url: string;
}
export declare function objectIsCallFrame(object: object): object is CallFrame;
export interface TraceFrame {
    frame: string;
    name: string;
    processId: ProcessID;
    url: string;
    parent?: string;
    isOutermostMainFrame?: boolean;
    isInPrimaryMainFrame?: boolean;
}
export interface Sample extends Event {
    ph: Phase.SAMPLE;
}
/**
 * A fake trace event created to support CDP.Profiler.Profiles in the
 * trace engine.
 *
 * Do not extend the SyntheticBased interface because this one doesn't have a raw trace event but a raw cpu profile.
 * Also we won't manage this event through SyntheticEventsManager.
 */
export interface SyntheticCpuProfile extends Complete {
    name: Name.CPU_PROFILE;
    id: ProfileID;
    args: Args & {
        data: {
            cpuProfile: Protocol.Profiler.Profile;
        };
    };
}
export interface Profile extends Sample {
    name: Name.PROFILE;
    id: ProfileID;
    args: Args & {
        data: {
            startTime: Micro;
            source?: ProfileSource;
        };
    };
}
export interface ProfileChunk extends Sample {
    name: Name.PROFILE_CHUNK;
    id: ProfileID;
    args: Args & {
        data: {
            cpuProfile?: PartialProfile;
            timeDeltas?: Micro[];
            lines?: number[];
            source?: ProfileSource;
            columns?: number[];
        };
    };
}
export interface PartialProfile {
    nodes?: PartialNode[];
    samples: CallFrameID[];
    /**
     * Contains trace ids assigned to samples, if any. Trace ids are
     * keyed by the sample index in the profile (the keys of the object
     * are strings containing the numeric index).
     */
    trace_ids?: Record<string, number>;
}
/**
 * Source of profile data, used to select the most relevant profile when
 * multiple profiles exist for the same thread.
 *
 * - 'Inspector': User-initiated via console.profile()/profileEnd().
 * - 'Internal': Browser-initiated during performance traces.
 * - 'SelfProfiling': Page-initiated via JS Self-Profiling API.
 *
 * Selection priority (see PROFILE_SOURCES_BY_PRIORITY in SamplesHandler.ts).
 */
export type ProfileSource = 'Inspector' | 'SelfProfiling' | 'Internal';
export declare const VALID_PROFILE_SOURCES: readonly ProfileSource[];
export interface PartialNode {
    callFrame: CallFrame;
    id: CallFrameID;
    parent?: CallFrameID;
}
export interface Complete extends Event {
    ph: Phase.COMPLETE;
    dur: Micro;
}
export interface RunTask extends Complete {
    name: Name.RUN_TASK;
}
export declare function isRunTask(event: Event): event is RunTask;
export interface FireIdleCallback extends Complete {
    name: Name.FIRE_IDLE_CALLBACK;
    args: Args & {
        data: {
            allottedMilliseconds: Milli;
            id: number;
            timedOut: boolean;
            frame?: string;
            sampleTraceId?: number;
        };
    };
}
export interface SchedulePostMessage extends Instant {
    name: Name.SCHEDULE_POST_MESSAGE;
    args: Args & {
        data: {
            traceId: string;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export interface HandlePostMessage extends Complete {
    name: Name.HANDLE_POST_MESSAGE;
    args: Args & {
        data: {
            traceId: string;
        };
    };
}
export interface Dispatch extends Complete {
    name: 'EventDispatch';
    args: Args & {
        data: {
            type: string;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export interface ParseHTML extends Complete {
    name: 'ParseHTML';
    args: Args & {
        beginData: {
            frame: string;
            startLine: number;
            url: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
        endData?: {
            endLine: number;
        };
    };
}
export interface Begin extends Event {
    ph: Phase.BEGIN;
}
export interface End extends Event {
    ph: Phase.END;
}
/**
 * This denotes a complete event created from a pair of begin and end
 * events. For practicality, instead of always having to look for the
 * end event corresponding to a begin event, we create a synthetic
 * complete event that comprises the data of both from the beginning in
 * the RendererHandler.
 */
export type SyntheticComplete = Complete;
/**
 * TODO(paulirish): Migrate to the new (Sept 2024) EventTiming trace events.
 * See https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/timing/window_performance.cc;l=900-901;drc=b503c262e425eae59ced4a80d59d176ed07152c7
 **/
export type EventTimingBeginOrEnd = EventTimingBegin | EventTimingEnd;
export interface EventTimingBegin extends Event {
    ph: Phase.ASYNC_NESTABLE_START;
    name: Name.EVENT_TIMING;
    id: string;
    args: Args & {
        data: {
            cancelable: boolean;
            duration: Milli;
            type: string;
            interactionId: number;
            interactionOffset: number;
            nodeId: Protocol.DOM.BackendNodeId;
            frame?: string;
            processingEnd?: Milli;
            processingStart?: Milli;
            timeStamp?: Milli;
            enqueuedToMainThreadTime?: Milli;
            commitFinishTime?: Milli;
        };
        frame?: string;
    };
}
export interface EventTimingEnd extends Event {
    ph: Phase.ASYNC_NESTABLE_END;
    name: Name.EVENT_TIMING;
    id: string;
    args: Args;
}
export interface GPUTask extends Complete {
    name: 'GPUTask';
    args: Args & {
        data: {
            renderer_pid: ProcessID;
            used_bytes: number;
        };
    };
}
export interface SyntheticNetworkRedirect {
    url: string;
    priority: string;
    requestMethod?: string;
    ts: Micro;
    dur: Micro;
}
/**
 * ProcessedArgsData is used to store the processed data of a network
 * request. Which is used to distinguish from the date we extract from the
 * trace event directly.
 **/
interface SyntheticArgsData {
    dnsLookup: Micro;
    download: Micro;
    downloadStart: Micro;
    finishTime: Micro;
    initialConnection: Micro;
    isDiskCached: boolean;
    isHttps: boolean;
    isMemoryCached: boolean;
    isPushedResource: boolean;
    networkDuration: Micro;
    processingDuration: Micro;
    proxyNegotiation: Micro;
    queueing: Micro;
    redirectionDuration: Micro;
    requestSent: Micro;
    sendStartTime: Micro;
    ssl: Micro;
    stalled: Micro;
    totalTime: Micro;
    /** receiveHeadersEnd - sendEnd */
    waiting: Micro;
    /** receiveHeadersStart - sendEnd */
    serverResponseTime: Micro;
}
export interface SyntheticNetworkRequest extends Complete, SyntheticBased<Phase.COMPLETE> {
    rawSourceEvent: ResourceSendRequest;
    args: Args & {
        data: {
            syntheticData: SyntheticArgsData;
            /** Size of the resource after decompression (if applicable). */
            decodedBodyLength: number;
            /**
             * Size of the resource over the network. Includes size of headers and
             * anything else in the HTTP response packet.
             */
            encodedDataLength: number;
            frame: string;
            fromServiceWorker: boolean | undefined;
            isLinkPreload: boolean;
            /** Empty string if no response. */
            mimeType: string;
            priority: Protocol.Network.ResourcePriority;
            initialPriority: Protocol.Network.ResourcePriority;
            /**
             * This is the protocol used to resolve the request.
             *
             * Note, this is not the same as URL.protocol.
             *
             * Example values (not exhaustive): http/0.9, http/1.0, http/1.1, http, h2, h3-Q050, data, blob, file
             */
            protocol: string;
            redirects: SyntheticNetworkRedirect[];
            renderBlocking: RenderBlocking;
            requestId: string;
            requestingFrameUrl: string;
            /** 0 if no response. */
            statusCode: number;
            resourceType: Protocol.Network.ResourceType;
            responseHeaders: Array<{
                name: string;
                value: string;
            }> | null;
            fetchPriorityHint: FetchPriorityHint;
            url: string;
            /** True only if got a 'resourceFinish' event indicating a failure. */
            failed: boolean;
            /** True only if got a 'resourceFinish' event. Note even failed requests with no response may be "finished". */
            finished: boolean;
            hasResponse: boolean;
            /** If undefined, trace was either too old or had no response. */
            connectionId: number | undefined;
            /** If undefined, trace was either too old or had no response. */
            connectionReused: boolean | undefined;
            initiator?: Initiator;
            requestMethod?: string;
            timing?: ResourceReceiveResponseTimingData;
            stackTrace?: CallFrame[];
            /** Server response time according to Lightrider. */
            lrServerResponseTime?: Milli;
        };
    };
    cat: 'loading';
    name: Name.SYNTHETIC_NETWORK_REQUEST;
    ph: Phase.COMPLETE;
    dur: Micro;
    tdur: Micro;
    ts: Micro;
    tts: Micro;
    pid: ProcessID;
    tid: ThreadID;
}
export interface SyntheticWebSocketConnection extends Complete, SyntheticBased<Phase.COMPLETE> {
    rawSourceEvent: Event;
    args: Args & {
        data: {
            identifier: number;
            priority: Protocol.Network.ResourcePriority;
            url: string;
        };
    };
    cat: string;
    name: 'SyntheticWebSocketConnection';
    ph: Phase.COMPLETE;
    dur: Micro;
    ts: Micro;
    pid: ProcessID;
    tid: ThreadID;
    s: Scope;
}
export declare enum AuctionWorkletType {
    BIDDER = "bidder",
    SELLER = "seller",
    UNKNOWN = "unknown"
}
export interface SyntheticAuctionWorklet extends Instant, SyntheticBased<Phase.INSTANT> {
    rawSourceEvent: Event;
    name: 'SyntheticAuctionWorklet';
    pid: ProcessID;
    host: string;
    target: string;
    type: AuctionWorkletType;
    args: Args & {
        data: {
            utilityThread: ThreadName;
            v8HelperThread: ThreadName;
        } & ({
            runningInProcessEvent: AuctionWorkletRunningInProcess;
            doneWithProcessEvent: AuctionWorkletDoneWithProcess;
        } | {
            doneWithProcessEvent: AuctionWorkletDoneWithProcess;
            runningInProcessEvent?: AuctionWorkletRunningInProcess;
        } | {
            runningInProcessEvent: AuctionWorkletRunningInProcess;
            doneWithProcessEvent?: AuctionWorkletDoneWithProcess;
        });
    };
}
export interface AuctionWorkletRunningInProcess extends Event {
    name: 'AuctionWorkletRunningInProcess';
    ph: Phase.INSTANT;
    args: Args & {
        data: {
            host: string;
            pid: ProcessID;
            target: string;
            type: AuctionWorkletType;
        };
    };
}
export interface AuctionWorkletDoneWithProcess extends Event {
    name: 'AuctionWorkletDoneWithProcess';
    ph: Phase.INSTANT;
    args: Args & {
        data: {
            host: string;
            pid: ProcessID;
            target: string;
            type: AuctionWorkletType;
        };
    };
}
export declare function isAuctionWorkletRunningInProcess(event: Event): event is AuctionWorkletRunningInProcess;
export declare function isAuctionWorkletDoneWithProcess(event: Event): event is AuctionWorkletDoneWithProcess;
/**
 * In January 2025 when crrev.com/c/6197645 landed, it changed the format of screenshot events.
 * That is why we two screenshot types:
 * `LegacyScreenshot` and `LegacySyntheticScreenshot`: BEFORE the above CL.
 * `Screenshot`: AFTER the above CL.
 * Important things to note:
 * 1. Both the "old" and "new" events share the name "Screenshot" but their format is very different.
 * 2. The old events had both a raw event (LegacyScreenshot) and a synthetic
 *    event (LegacySyntheticScreenshot). The new events only have a raw event, as
 *    we do not need the additional complexity of a synthetic event.
 * 3. Because we like to support "old" traces, DevTools will maintain its
 *    support for both screenshot events for the foreseeable future. If you are
 *    consuming screenshot events from the ScreenshotHandler, you must make sure
 *    to have your code deal with the two different formats.
 */
export interface LegacyScreenshot extends Event {
    /**
     * @deprecated This value is incorrect. Use ScreenshotHandler.getPresentationTimestamp()
     */
    ts: Micro;
    /** The id is the frame sequence number in hex */
    id: string;
    args: Args & {
        snapshot: string;
    };
    name: Name.SCREENSHOT;
    cat: 'disabled-by-default-devtools.screenshot';
    ph: Phase.OBJECT_SNAPSHOT;
}
export declare function isLegacyScreenshot(event: Event): event is LegacyScreenshot;
export declare function isLegacySyntheticScreenshot(event: Event): event is LegacySyntheticScreenshot;
export declare function isScreenshot(event: Event): event is Screenshot;
export interface LegacySyntheticScreenshot extends Event, SyntheticBased {
    rawSourceEvent: LegacyScreenshot;
    /** This is the correct presentation timestamp. */
    ts: Micro;
    args: Args & {
        dataUri: string;
    };
    name: Name.SCREENSHOT;
    cat: 'disabled-by-default-devtools.screenshot';
    ph: Phase.OBJECT_SNAPSHOT;
}
export interface Screenshot extends Instant {
    args: Args & {
        snapshot: string;
        source_id: number;
        frame_sequence: number;
        expected_display_time: number;
    };
}
export interface Animation extends Event {
    args: Args & {
        data: {
            nodeName?: string;
            nodeId?: Protocol.DOM.BackendNodeId;
            displayName?: string;
            id?: string;
            name?: string;
            state?: string;
            compositeFailed?: number;
            unsupportedProperties?: string[];
        };
    };
    name: 'Animation';
    id2?: {
        local?: string;
    };
    ph: Phase.ASYNC_NESTABLE_START | Phase.ASYNC_NESTABLE_END | Phase.ASYNC_NESTABLE_INSTANT;
}
export interface Metadata extends Event {
    ph: Phase.METADATA;
    args: Args & {
        name?: string;
        uptime?: string;
    };
}
export interface ThreadName extends Metadata {
    name: Name.THREAD_NAME;
    args: Args & {
        name?: string;
    };
}
export interface ProcessName extends Metadata {
    name: 'process_name';
}
export interface Mark extends Event {
    ph: Phase.MARK;
}
export interface NavigationStart extends Mark {
    name: Name.NAVIGATION_START;
    args: Args & {
        frame: string;
        data: {
            /** Must be non-empty to be valid. An empty documentLoaderURL means the event can be ignored. */
            documentLoaderURL: string;
            isLoadingMainFrame: boolean;
            navigationId: string;
            /**
             * `isOutermostMainFrame` was introduced in crrev.com/c/3625434 and exists because of Fenced Frames
             * [github.com/WICG/fenced-frame/tree/master/explainer]. Fenced frames introduce a situation where
             * `isLoadingMainFrame` could be true for a navigation, but that navigation be within an embedded "main frame", and
             * therefore it wouldn't be on the top level main frame. In situations where we need to distinguish that, we can
             * rely on `isOutermostMainFrame`, which will only be true for navigations on the top level main frame.
             * This flag is optional as it was introduced in May 2022; so users reasonably may import traces from before that
             * date that do not have this field present.
             */
            isOutermostMainFrame?: boolean;
            /**
             * @deprecated use documentLoaderURL for navigation events URLs
             */
            url?: string;
        };
    };
}
export interface SoftNavigationStart extends Event {
    name: Name.SOFT_NAVIGATION_START;
    ph: Phase.ASYNC_NESTABLE_INSTANT;
    args: Args & {
        frame: string;
        context: {
            softNavContextId: number;
            URL: string;
            timeOrigin: number;
            domModifications: number;
            firstContentfulPaint: number;
            paintedArea: number;
            performanceTimelineNavigationId: number;
            repaintedArea: number;
        };
    };
}
export declare function isSoftNavigationStart(event: Event): event is SoftNavigationStart;
export interface FirstContentfulPaint extends Mark {
    name: Name.MARK_FCP;
    args: Args & {
        frame: string;
        data: {
            navigationId: string;
        };
    };
}
export interface SyntheticSoftFirstContentfulPaint extends Omit<SoftNavigationStart, 'name' | 'ph'>, Omit<SyntheticBased, 'name' | 'ph' | 'args'> {
    name: Name.MARK_SOFT_FCP;
    ph: Phase.MARK;
}
export type AnyFirstContentfulPaint = FirstContentfulPaint | SyntheticSoftFirstContentfulPaint;
export interface FirstPaint extends Mark {
    name: Name.MARK_FIRST_PAINT;
    args: Args & {
        frame: string;
        data: {
            navigationId: string;
        };
    };
}
export type PageLoadEvent = AnyFirstContentfulPaint | MarkDOMContent | InteractiveTime | AnyLargestContentfulPaintCandidate | LayoutShift | FirstPaint | MarkLoad | NavigationStart | SoftNavigationStart;
export declare function isMarkerEvent(event: Event): event is MarkerEvent;
export declare function eventIsPageLoadEvent(event: Event): event is PageLoadEvent;
export interface LargestContentfulPaintCandidate extends Mark {
    name: Name.MARK_LCP_CANDIDATE;
    args: Args & {
        frame: string;
        data: {
            candidateIndex: number;
            isOutermostMainFrame: boolean;
            isMainFrame: boolean;
            navigationId: string;
            nodeId: Protocol.DOM.BackendNodeId;
            loadingAttr?: string;
            size?: number;
            type?: string;
            nodeName?: string;
        };
    };
}
export interface LargestContentfulPaintCandidateForSoftNavigation extends Mark {
    name: Name.MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION;
    args: Args & {
        frame: string;
        data: {
            candidateIndex: number;
            isOutermostMainFrame: boolean;
            isMainFrame: boolean;
            nodeId: Protocol.DOM.BackendNodeId;
            performanceTimelineNavigationId: number;
            loadingAttr?: string;
            size?: number;
            type?: string;
            nodeName?: string;
        };
    };
}
export type AnyLargestContentfulPaintCandidate = LargestContentfulPaintCandidate | LargestContentfulPaintCandidateForSoftNavigation;
export interface LargestImagePaintCandidate extends Mark {
    name: 'LargestImagePaint::Candidate';
    args: Args & {
        frame: string;
        data: {
            candidateIndex: number;
            imageUrl: string;
            DOMNodeId: Protocol.DOM.BackendNodeId;
        };
    };
}
export interface LargestTextPaintCandidate extends Mark {
    name: 'LargestTextPaint::Candidate';
    args: Args & {
        frame: string;
        data: {
            candidateIndex: number;
            DOMNodeId: Protocol.DOM.BackendNodeId;
            nodeName?: string;
        };
    };
}
export interface InteractiveTime extends Mark {
    name: 'InteractiveTime';
    args: Args & {
        args: {
            total_blocking_time_ms: number;
        };
        frame: string;
    };
}
export interface Instant extends Event {
    ph: Phase.INSTANT;
    s: Scope;
}
export interface DOMStats extends Instant {
    name: 'DOMStats';
    args: Args & {
        data: {
            frame: string;
            totalElements: number;
            maxChildren?: {
                nodeId: Protocol.DOM.BackendNodeId;
                nodeName: string;
                numChildren: number;
            };
            maxDepth?: {
                nodeId: Protocol.DOM.BackendNodeId;
                nodeName: string;
                depth: number;
            };
        };
    };
}
export interface UpdateCounters extends Instant {
    name: 'UpdateCounters';
    args: Args & {
        data: {
            jsHeapSizeUsed: number;
            documents?: number;
            jsEventListeners?: number;
            nodes?: number;
            gpuMemoryLimitKB?: number;
        };
    };
}
export type RendererEvent = Instant | Complete;
export interface TracingStartedInBrowser extends Instant {
    name: Name.TRACING_STARTED_IN_BROWSER;
    args: Args & {
        data: {
            frameTreeNodeId: number;
            persistentIds: boolean;
            frames?: TraceFrame[];
        };
    };
}
export interface TracingSessionIdForWorker extends Instant {
    name: 'TracingSessionIdForWorker';
    args: Args & {
        data?: {
            url: string;
            workerId: WorkerId;
            workerThreadId: ThreadID;
            frame: string;
        };
    };
}
export declare function isTracingSessionIdForWorker(event: Event): event is TracingSessionIdForWorker;
export interface FrameCommittedInBrowser extends Instant {
    name: 'FrameCommittedInBrowser';
    args: Args & {
        data: TraceFrame;
    };
}
export interface MainFrameViewport extends Instant {
    name: 'PaintTimingVisualizer::Viewport';
    args: Args & {
        data: {
            viewport_rect: number[];
            dpr?: number;
        };
    };
}
export interface CommitLoad extends Instant {
    name: 'CommitLoad';
    args: Args & {
        data: {
            frame: string;
            isMainFrame: boolean;
            name: string;
            page: string;
            url: string;
            nodeId?: number;
            parent?: string;
            isOutermostMainFrame?: boolean;
        };
    };
}
export interface MarkDOMContent extends Instant {
    name: Name.MARK_DOM_CONTENT;
    args: Args & {
        data: {
            frame: string;
            isMainFrame: boolean;
            page: string;
            isOutermostMainFrame?: boolean;
        };
    };
}
export interface MarkLoad extends Instant {
    name: Name.MARK_LOAD;
    args: Args & {
        data: {
            frame: string;
            isMainFrame: boolean;
            page: string;
            isOutermostMainFrame?: boolean;
        };
    };
}
export interface Async extends Event {
    ph: Phase.ASYNC_NESTABLE_START | Phase.ASYNC_NESTABLE_INSTANT | Phase.ASYNC_NESTABLE_END | Phase.ASYNC_STEP_INTO | Phase.ASYNC_BEGIN | Phase.ASYNC_END | Phase.ASYNC_STEP_PAST;
}
export type TraceRect = [number, number, number, number];
export interface TraceImpactedNode {
    new_rect: TraceRect;
    node_id: Protocol.DOM.BackendNodeId;
    old_rect: TraceRect;
    debug_name?: string;
}
export interface LayoutShiftData {
    cumulative_score: number;
    frame_max_distance: number;
    had_recent_input: boolean;
    impacted_nodes: TraceImpactedNode[] | undefined;
    is_main_frame: boolean;
    overall_max_distance: number;
    region_rects: TraceRect[];
    /** @deprecated This value will incorrectly overreport for shifts within an iframe. */
    score: number;
    /** This is the preferred "score", used for CLS. If `is_main_frame` is true, `score` and `weighted_score_delta` will be equal. But if the shift is from an iframe, `weighted_score_delta` will be appropriately reduced to account for the viewport size of that iframe. https://wicg.github.io/layout-instability/#subframe-weighting-factor and b/275509162 */
    weighted_score_delta: number;
    navigationId?: string;
}
export interface LayoutShift extends Instant {
    name: Name.LAYOUT_SHIFT;
    normalized?: boolean;
    args: Args & {
        frame: string;
        data?: LayoutShiftData;
    };
}
interface LayoutShiftSessionWindowData {
    cumulativeWindowScore: number;
    id: number;
}
export interface LayoutShiftParsedData {
    /** screenshot taken before and after this shift. Before *should* always exist, but after might not at the end of a trace. */
    screenshots: {
        before: LegacySyntheticScreenshot | Screenshot | null;
        after: LegacySyntheticScreenshot | Screenshot | null;
    };
    timeFromNavigation?: Micro;
    cumulativeWeightedScoreInWindow: number;
    sessionWindowData: LayoutShiftSessionWindowData;
}
export interface SyntheticLayoutShift extends Omit<LayoutShift, 'name'>, SyntheticBased<Phase.INSTANT> {
    name: Name.SYNTHETIC_LAYOUT_SHIFT;
    rawSourceEvent: LayoutShift;
    args: Args & {
        frame: string;
        data?: LayoutShiftData & {
            rawEvent: LayoutShift;
        };
    };
    parsedData: LayoutShiftParsedData;
}
export declare const NO_NAVIGATION = "NO_NAVIGATION";
/**
 * This maybe be a navigation id string from Chrome, or `NO_NAVIGATION`, which represents the
 * portion of the trace for which we don't have any navigation event for (as it happeneded prior
 * to the trace start).
 */
export type NavigationId = string;
/**
 * This is a synthetic Layout shift cluster: a session window of layout shifts.
 *
 * Do not extend the SyntheticBased interface because a cluster is built from
 * many layout shifts and doesn't have a raw trace event of its own. For the
 * same reason, clusters are not registered with SyntheticEventsManager. Use
 * `worstShiftEvent` to find the layout shift with the highest score in the
 * cluster.
 */
export interface SyntheticLayoutShiftCluster extends Event {
    name: 'SyntheticLayoutShiftCluster';
    clusterWindow: TraceWindowMicro;
    clusterCumulativeScore: number;
    events: SyntheticLayoutShift[];
    scoreWindows: {
        good: TraceWindowMicro;
        needsImprovement?: TraceWindowMicro;
        bad?: TraceWindowMicro;
    };
    navigationId?: NavigationId;
    worstShiftEvent?: Event;
    ts: Micro;
    dur: Micro;
    cat: '';
    ph: Phase.COMPLETE;
    pid: ProcessID;
    tid: ThreadID;
}
export type FetchPriorityHint = 'low' | 'high' | 'auto';
export type RenderBlocking = 'blocking' | 'non_blocking' | 'in_body_parser_blocking' | 'potentially_blocking' | 'dynamically_injected_non_blocking';
export interface Initiator {
    type: Protocol.Network.InitiatorType;
    fetchType: string;
    columnNumber?: number;
    lineNumber?: number;
    url?: string;
}
export interface ResourceSendRequest extends Instant {
    name: 'ResourceSendRequest';
    args: Args & {
        data: {
            frame: string;
            requestId: string;
            url: string;
            priority: Protocol.Network.ResourcePriority;
            /** Added Feb 2024. https://crrev.com/c/5277583 */
            resourceType?: Protocol.Network.ResourceType;
            /** Added Feb 2024. https://crrev.com/c/5297615 */
            fetchPriorityHint?: FetchPriorityHint;
            requestMethod?: string;
            renderBlocking?: RenderBlocking;
            initiator?: Initiator;
            isLinkPreload?: boolean;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export interface ResourceChangePriority extends Instant {
    name: 'ResourceChangePriority';
    args: Args & {
        data: {
            requestId: string;
            priority: Protocol.Network.ResourcePriority;
        };
    };
}
/** Only sent for navigations. https://source.chromium.org/chromium/chromium/src/+/main:content/browser/devtools/devtools_instrumentation.cc;l=1612-1647;drc=ec7daf93d0479b758610c75f4e146fd4d2d6ed2b */
export interface ResourceWillSendRequest extends Instant {
    name: Name.RESOURCE_WILL_SEND_REQUEST;
    args: Args & {
        data: {
            requestId: string;
        };
    };
}
export interface ResourceFinish extends Instant {
    name: 'ResourceFinish';
    args: Args & {
        data: {
            decodedBodyLength: number;
            didFail: boolean;
            encodedDataLength: number;
            requestId: string;
            finishTime?: Seconds;
        };
    };
}
export interface ResourceReceivedData extends Instant {
    name: 'ResourceReceivedData';
    args: Args & {
        data: {
            encodedDataLength: number;
            frame: string;
            requestId: string;
        };
    };
}
/** See https://mdn.github.io/shared-assets/images/diagrams/api/performance/timestamp-diagram.svg  */
interface ResourceReceiveResponseTimingData {
    connectEnd: Milli;
    connectStart: Milli;
    dnsEnd: Milli;
    dnsStart: Milli;
    proxyEnd: Milli;
    proxyStart: Milli;
    pushEnd: Milli;
    pushStart: Milli;
    receiveHeadersEnd: Milli;
    /** M116. */
    receiveHeadersStart?: Milli;
    /** When the network service is about to handle a request, ie. just before going to the HTTP cache or going to the network for DNS/connection setup. */
    requestTime: Seconds;
    sendEnd: Milli;
    sendStart: Milli;
    sslEnd: Milli;
    sslStart: Milli;
    workerReady: Milli;
    workerStart: Milli;
}
export interface ResourceReceiveResponse extends Instant {
    name: 'ResourceReceiveResponse';
    args: Args & {
        data: {
            /**
             * This is the protocol used to resolve the request.
             *
             * Note, this is not the same as URL.protocol.
             *
             * Example values (not exhaustive): http/0.9, http/1.0, http/1.1, http, h2, h3-Q050, data, blob
             */
            encodedDataLength: number;
            fromCache: boolean;
            fromServiceWorker: boolean;
            mimeType: string;
            requestId: string;
            statusCode: number;
            protocol?: string;
            frame?: string;
            responseTime?: Milli;
            connectionId?: number;
            connectionReused?: boolean;
            timing?: ResourceReceiveResponseTimingData;
            headers?: Array<{
                name: string;
                value: string;
            }>;
        };
    };
}
export interface ResourceMarkAsCached extends Instant {
    name: 'ResourceMarkAsCached';
    args: Args & {
        data: {
            requestId: string;
        };
    };
}
export declare enum LayoutInvalidationReason {
    SIZE_CHANGED = "Size changed",
    ATTRIBUTE = "Attribute",
    ADDED_TO_LAYOUT = "Added to layout",
    SCROLLBAR_CHANGED = "Scrollbar changed",
    REMOVED_FROM_LAYOUT = "Removed from layout",
    STYLE_CHANGED = "Style changed",
    FONTS_CHANGED = "Fonts changed",
    UNKNOWN = "Unknown"
}
export interface LayoutInvalidationTracking extends Instant {
    name: Name.LAYOUT_INVALIDATION_TRACKING;
    args: Args & {
        data: {
            frame: string;
            nodeId: Protocol.DOM.BackendNodeId;
            reason: LayoutInvalidationReason;
            nodeName?: string;
            stackTrace?: CallFrame[];
        };
    };
}
export interface ScheduleStyleInvalidationTracking extends Instant {
    name: Name.SCHEDULE_STYLE_INVALIDATION_TRACKING;
    args: Args & {
        data: {
            frame: string;
            nodeId: Protocol.DOM.BackendNodeId;
            invalidationSet?: string;
            invalidatedSelectorId?: string;
            reason?: LayoutInvalidationReason;
            changedClass?: string;
            changedAttribute?: string;
            changedId?: string;
            nodeName?: string;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isScheduleStyleInvalidationTracking(event: Event): event is ScheduleStyleInvalidationTracking;
export declare enum StyleRecalcInvalidationReason {
    ANIMATION = "Animation",
    RELATED_STYLE_RULE = "Related style rule"
}
export interface StyleRecalcInvalidationTracking extends Instant {
    name: Name.STYLE_RECALC_INVALIDATION_TRACKING;
    args: Args & {
        data: {
            frame: string;
            nodeId: Protocol.DOM.BackendNodeId;
            reason: StyleRecalcInvalidationReason;
            subtree: boolean;
            nodeName?: string;
            extraData?: string;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isStyleRecalcInvalidationTracking(event: Event): event is StyleRecalcInvalidationTracking;
export interface StyleInvalidatorInvalidationTracking extends Instant {
    name: Name.STYLE_INVALIDATOR_INVALIDATION_TRACKING;
    args: Args & {
        data: {
            frame: string;
            nodeId: Protocol.DOM.BackendNodeId;
            reason: string;
            invalidationList: Array<{
                id: string;
                classes?: string[];
            }>;
            nodeName?: string;
            extraData?: string;
            stackTrace?: CallFrame[];
            selectors?: Array<{
                selector: string;
                style_sheet_id: string;
            }>;
        };
    };
}
export declare function isStyleInvalidatorInvalidationTracking(event: Event): event is StyleInvalidatorInvalidationTracking;
export interface BeginCommitCompositorFrame extends Instant {
    name: Name.BEGIN_COMMIT_COMPOSITOR_FRAME;
    args: Args & {
        frame: string;
        is_mobile_optimized: boolean;
    };
}
export declare function isBeginCommitCompositorFrame(event: Event): event is BeginCommitCompositorFrame;
export interface ParseMetaViewport extends Instant {
    name: Name.PARSE_META_VIEWPORT;
    args: Args & {
        data: {
            node_id: Protocol.DOM.BackendNodeId;
            content: string;
            frame?: string;
        };
    };
}
export declare function isParseMetaViewport(event: Event): event is ParseMetaViewport;
export type MetaCharsetDisposition = 'found-in-first-1024-bytes' | 'found-after-first-1024-bytes' | 'not-found';
export interface MetaCharsetCheck extends Instant {
    name: Name.META_CHARSET_CHECK;
    args: Args & {
        data: {
            frame: string;
            disposition: MetaCharsetDisposition;
        };
    };
}
export declare function isMetaCharsetCheck(event: Event): event is MetaCharsetCheck;
export interface LinkPreconnect extends Instant {
    name: Name.LINK_PRECONNECT;
    args: Args & {
        data: {
            node_id: Protocol.DOM.BackendNodeId;
            url: string;
            frame?: string;
        };
    };
}
export declare function isLinkPreconnect(event: Event): event is LinkPreconnect;
export interface ScheduleStyleRecalculation extends Instant {
    name: Name.SCHEDULE_STYLE_RECALCULATION;
    args: Args & {
        data: {
            frame: string;
            reason?: StyleRecalcInvalidationReason;
            subtree?: boolean;
            nodeId?: Protocol.DOM.BackendNodeId;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export declare function isScheduleStyleRecalculation(event: Event): event is ScheduleStyleRecalculation;
export interface RenderFrameImplCreateChildFrame extends Event {
    name: Name.RENDER_FRAME_IMPL_CREATE_CHILD_FRAME;
    args: Args & {
        child_frame_token: string;
        frame_token: string;
    };
}
export declare function isRenderFrameImplCreateChildFrame(event: Event): event is RenderFrameImplCreateChildFrame;
export interface LayoutImageUnsized extends Event {
    name: Name.LAYOUT_IMAGE_UNSIZED;
    args: Args & {
        data: {
            nodeId: Protocol.DOM.BackendNodeId;
            frameId: string;
        };
    };
}
export declare function isLayoutImageUnsized(event: Event): event is LayoutImageUnsized;
export interface PrePaint extends Complete {
    name: 'PrePaint';
    args?: Args & {
        data?: {
            frame?: string;
        };
    };
}
export interface PairableAsync extends Event {
    ph: Phase.ASYNC_NESTABLE_START | Phase.ASYNC_NESTABLE_END | Phase.ASYNC_NESTABLE_INSTANT;
    id2?: {
        local?: string;
        global?: string;
    };
    id?: string;
}
export interface PairableAsyncBegin extends PairableAsync {
    ph: Phase.ASYNC_NESTABLE_START;
}
export interface PairableAsyncInstant extends PairableAsync {
    ph: Phase.ASYNC_NESTABLE_INSTANT;
}
export interface PairableAsyncEnd extends PairableAsync {
    ph: Phase.ASYNC_NESTABLE_END;
}
export declare function isPairableAsyncBegin(e: Event): e is PairableAsyncBegin;
export declare function isPairableAsyncEnd(e: Event): e is PairableAsyncEnd;
export declare function isPairableAsyncInstant(e: Event): e is PairableAsyncInstant;
export interface AnimationFrame extends PairableAsync {
    name: Name.ANIMATION_FRAME;
    args?: AnimationFrameArgs;
}
export type AnimationFrameArgs = Args & {
    animation_frame_timing_info: {
        blocking_duration_ms: number;
        duration_ms: number;
        num_scripts: number;
    };
    id: string;
};
export interface AnimationFrameAsyncStart extends AnimationFrame {
    ph: Phase.ASYNC_NESTABLE_START;
}
export interface AnimationFrameAsyncEnd extends AnimationFrame {
    ph: Phase.ASYNC_NESTABLE_END;
}
export declare function isAnimationFrameAsyncStart(data: Event): data is AnimationFrameAsyncStart;
export declare function isAnimationFrameAsyncEnd(data: Event): data is AnimationFrameAsyncEnd;
export interface AnimationFramePresentation extends Event {
    name: Name.ANIMATION_FRAME_PRESENTATION;
    ph: Phase.ASYNC_NESTABLE_INSTANT;
    args?: Args & {
        id: string;
    };
}
export declare function isAnimationFramePresentation(data: Event): data is AnimationFramePresentation;
export interface UserTiming extends Event {
    id2?: {
        local?: string;
        global?: string;
    };
    id?: string;
    cat: 'blink.user_timing';
}
export interface DomLoading extends UserTiming {
    name: Name.DOM_LOADING;
    args: Args & {
        frame?: string;
    };
}
export interface BeginRemoteFontLoad extends UserTiming {
    name: Name.BEGIN_REMOTE_FONT_LOAD;
    args: Args & {
        display: string;
        id: number;
        url?: string;
    };
}
export interface RemoteFontLoaded extends UserTiming {
    name: Name.REMOTE_FONT_LOADED;
    args: Args & {
        url: string;
        name: string;
    };
}
export type PairableUserTiming = UserTiming & PairableAsync;
export interface PerformanceMeasureBegin extends PairableUserTiming {
    args: Args & {
        detail?: string;
        callTime?: Micro;
        traceId?: number;
        stackTrace?: CallFrame[];
    };
    ph: Phase.ASYNC_NESTABLE_START;
}
export type PerformanceMeasureEnd = PairableUserTiming & PairableAsyncEnd;
export type PerformanceMeasure = PerformanceMeasureBegin | PerformanceMeasureEnd;
export interface PerformanceMark extends UserTiming {
    args: Args & {
        data: {
            detail?: string;
            callTime?: Micro;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
        stackTrace?: CallFrame[];
    };
    ph: Phase.INSTANT | Phase.MARK | Phase.ASYNC_NESTABLE_INSTANT;
}
export interface ConsoleTimeBegin extends PairableAsyncBegin {
    cat: 'blink.console';
}
export interface ConsoleTimeEnd extends PairableAsyncEnd {
    cat: 'blink.console';
}
export type ConsoleTime = ConsoleTimeBegin | ConsoleTimeEnd;
export interface ConsoleTimeStamp extends Event {
    cat: 'devtools.timeline';
    name: Name.TIME_STAMP;
    ph: Phase.INSTANT;
    args: Args & {
        data: {
            message: string;
            name?: string | number;
            start?: string | number;
            end?: string | number;
            track?: string | number;
            trackGroup?: string | number;
            color?: string | number;
            devtools?: string;
            frame?: string;
            sampleTraceId?: number;
        };
    };
}
export interface SyntheticConsoleTimeStamp extends Event, SyntheticBased {
    cat: 'disabled-by-default-v8.inspector';
    ph: Phase.COMPLETE;
}
export interface UserTimingMeasure extends Event {
    cat: 'devtools.timeline';
    ph: Phase.COMPLETE;
    name: Name.USER_TIMING_MEASURE;
    args: Args & {
        sampleTraceId: number;
        traceId: number;
    };
}
/**
 * ChromeFrameReporter args for PipelineReporter event.
 * Matching proto: https://source.chromium.org/chromium/chromium/src/+/main:third_party/perfetto/protos/perfetto/trace/track_event/chrome_frame_reporter.proto
 */
interface ChromeFrameReporter {
    state: State;
    enum: FrameDropReason;
    /** The reason is set only if |state| is not |STATE_UPDATED_ALL|. */
    reason: FrameDropReason;
    frame_source: number;
    /**
     * Identifies a BeginFrameArgs (along with the source_id).
     * See comments in components/viz/common/frame_sinks/begin_frame_args.h.
     */
    frame_sequence: number;
    /**
     * If this is a dropped frame (i.e. if |state| is set to |STATE_DROPPED| or
     * |STATE_PRESENTED_PARTIAL|), then indicates whether this frame impacts smoothness.
     */
    affects_smoothness: boolean;
    /** The type of active scroll. */
    scroll_state: ScrollState;
    /** If any main thread animation is active during this frame. */
    has_main_animation: boolean;
    /** If any compositor thread animation is active during this frame. */
    has_compositor_animation: boolean;
    /** If any touch-driven UX (not scroll) is active during this frame. */
    has_smooth_input_main: boolean;
    /**
     * Whether the frame contained any missing content (i.e. whether there was
     * checkerboarding in the frame).
     */
    has_missing_content: boolean;
    /** The id of layer_tree_host that the frame has been produced for. */
    layer_tree_host_id: number;
    /** If total latency of PipelineReporter exceeds a certain limit. */
    has_high_latency: boolean;
    /**
     *  Indicate if the frame is "FORKED" (i.e. a PipelineReporter event starts at
     * the same frame sequence as another PipelineReporter) or "BACKFILL"
     * (i.e. dropped frames when there are no partial compositor updates).
     */
    frame_type: FrameType;
    /**
     * The breakdown stage of PipelineReporter that is most likely accountable for
     * high latency.
     */
    high_latency_contribution_stage: string[];
}
declare const enum State {
    /** The frame did not have any updates to present. **/
    STATE_NO_UPDATE_DESIRED = "STATE_NO_UPDATE_DESIRED",
    /**
     * The frame presented all the desired updates (i.e. any updates requested
     * from both the compositor thread and main-threads were handled). *
     */
    STATE_PRESENTED_ALL = "STATE_PRESENTED_ALL",
    /**
     *  The frame was presented with some updates, but also missed some updates
     * (e.g. missed updates from the main-thread, but included updates from the
     * compositor thread). *
     */
    STATE_PRESENTED_PARTIAL = "STATE_PRESENTED_PARTIAL",
    /**
     * The frame was dropped, i.e. some updates were desired for the frame, but
     * was not presented. *
     */
    STATE_DROPPED = "STATE_DROPPED"
}
declare const enum FrameDropReason {
    REASON_UNSPECIFIED = "REASON_UNSPECIFIED",
    /**
     *  Frame was dropped by the display-compositor.
     * The display-compositor may drop a frame some times (e.g. the frame missed
     * the deadline, or was blocked on surface-sync, etc.) *
     */
    REASON_DISPLAY_COMPOSITOR = "REASON_DISPLAY_COMPOSITOR",
    /**
     *  Frame was dropped because of the main-thread.
     * The main-thread may cause a frame to be dropped, e.g. if the main-thread
     * is running expensive javascript, or doing a lot of layout updates, etc. *
     */
    REASON_MAIN_THREAD = "REASON_MAIN_THREAD",
    /**
     *  Frame was dropped by the client compositor.
     * The client compositor can drop some frames too (e.g. attempting to
     * recover latency, missing the deadline, etc.). *
     */
    REASON_CLIENT_COMPOSITOR = "REASON_CLIENT_COMPOSITOR"
}
declare const enum ScrollState {
    SCROLL_NONE = "SCROLL_NONE",
    SCROLL_MAIN_THREAD = "SCROLL_MAIN_THREAD",
    SCROLL_COMPOSITOR_THREAD = "SCROLL_COMPOSITOR_THREAD",
    /** Used when it can't be determined whether a scroll is in progress or not. */
    SCROLL_UNKNOWN = "SCROLL_UNKNOWN"
}
declare const enum FrameType {
    FORKED = "FORKED",
    BACKFILL = "BACKFILL"
}
/**
 * TODO(crbug.com/409484302): Remove once Chrome migrates from
 * ChromeTrackEvent.chrome_frame_reporter to ChromeTrackEvent.frame_reporter.
 **/
export interface OldChromeFrameReporterArgs {
    chrome_frame_reporter: ChromeFrameReporter;
}
export interface NewChromeFrameReporterArgs {
    frame_reporter: ChromeFrameReporter;
}
export interface PipelineReporter extends Event {
    id2?: {
        local?: string;
    };
    ph: Phase.ASYNC_NESTABLE_START | Phase.ASYNC_NESTABLE_END;
    args: Args & (OldChromeFrameReporterArgs | NewChromeFrameReporterArgs);
}
export declare function isPipelineReporter(event: Event): event is PipelineReporter;
/**
 * A type used for synthetic events created based on a raw trace event.
 * A branded type is used to ensure not all events can be typed as
 * SyntheticBased and prevent places different to the
 * SyntheticEventsManager from creating synthetic events. This is
 * because synthetic events need to be registered in order to resolve
 * serialized event keys into event objects, so we ensure events are
 * registered at the time they are created by the SyntheticEventsManager.
 **/
export interface SyntheticBased<Ph extends Phase = Phase, T extends Event = Event> extends Event {
    ph: Ph;
    rawSourceEvent: T;
    _tag: 'SyntheticEntryTag';
}
export declare function isSyntheticBased(event: Event): event is SyntheticBased;
/**
 * Nestable async events with a duration are made up of two distinct
 * events: the begin, and the end. We need both of them to be able to
 * display the right information, so we create these synthetic events.
 **/
export interface SyntheticEventPair<T extends PairableAsync = PairableAsync> extends SyntheticBased<Phase, T> {
    rawSourceEvent: T;
    name: T['name'];
    cat: T['cat'];
    id?: string;
    id2?: {
        local?: string;
        global?: string;
    };
    dur: Micro;
    args: Args & {
        data: {
            beginEvent: T & PairableAsyncBegin;
            endEvent: T & PairableAsyncEnd;
            instantEvents?: Array<T & PairableAsyncInstant>;
        };
    };
}
export type SyntheticPipelineReporterPair = SyntheticEventPair<PipelineReporter>;
export type SyntheticAnimationFramePair = SyntheticEventPair<AnimationFrame>;
export type SyntheticUserTimingPair = SyntheticEventPair<PerformanceMeasure>;
export type SyntheticConsoleTimingPair = SyntheticEventPair<ConsoleTime>;
export type SyntheticAnimationPair = SyntheticEventPair<Animation>;
export interface SyntheticInteractionPair extends SyntheticEventPair<EventTimingBeginOrEnd> {
    args: SyntheticEventPair<EventTimingBeginOrEnd>['args'] & {
        data: {
            frame: string;
            navigationId?: string;
        };
    };
    interactionId: number;
    type: string;
    ts: Micro;
    dur: Micro;
    processingStart: Micro;
    processingEnd: Micro;
    inputDelay: Micro;
    mainThreadHandling: Micro;
    presentationDelay: Micro;
}
/**
 * A profile call created in the frontend from samples disguised as a
 * trace event.
 *
 * We store the sampleIndex, profileId and nodeId so that we can easily link
 * back a Synthetic Trace Entry to an individual Sample trace event within a
 * Profile.
 *
 * Because a sample contains a set of call frames representing the stack at the
 * point in time that the sample was created, we also have to store the ID of
 * the Node that points to the function call that this profile call represents.
 */
export interface SyntheticProfileCall extends Event {
    callFrame: Protocol.Runtime.CallFrame;
    nodeId: Protocol.integer;
    sampleIndex: number;
    profileId: ProfileID;
}
/**
 * A JS Sample reflects a single sample from the V8 CPU Profile
 */
export interface SyntheticJSSample extends Event {
    name: Name.JS_SAMPLE;
    args: Args & {
        data: {
            stackTrace: Protocol.Runtime.CallFrame[];
            traceId?: number;
        };
    };
    ph: Phase.INSTANT;
}
export declare function isJSSample(event: Event): event is SyntheticJSSample;
export declare function isSyntheticInteraction(event: Event): event is SyntheticInteractionPair;
export interface DrawFrame extends Instant {
    name: Name.DRAW_FRAME;
    args: Args & {
        layerTreeId: number;
        frameSeqId: number;
    };
}
export declare function isDrawFrame(event: Event): event is DrawFrame;
export interface BeginFrame extends Instant {
    name: Name.BEGIN_FRAME;
    args: Args & {
        layerTreeId: number;
        frameSeqId: number;
    };
}
export declare function isBeginFrame(event: Event): event is BeginFrame;
export interface DroppedFrame extends Instant {
    name: Name.DROPPED_FRAME;
    args: Args & {
        layerTreeId: number;
        frameSeqId: number;
        hasPartialUpdate?: boolean;
    };
}
export declare function isDroppedFrame(event: Event): event is DroppedFrame;
export interface RequestMainThreadFrame extends Instant {
    name: Name.REQUEST_MAIN_THREAD_FRAME;
    args: Args & {
        layerTreeId: number;
    };
}
export declare function isRequestMainThreadFrame(event: Event): event is RequestMainThreadFrame;
export interface BeginMainThreadFrame extends Instant {
    name: Name.BEGIN_MAIN_THREAD_FRAME;
    args: Args & {
        layerTreeId: number;
        data: {
            frameId?: number;
        };
    };
}
export declare function isBeginMainThreadFrame(event: Event): event is BeginMainThreadFrame;
export interface NeedsBeginFrameChanged extends Instant {
    name: Name.NEEDS_BEGIN_FRAME_CHANGED;
    args: Args & {
        layerTreeId: number;
        data: {
            needsBeginFrame: number;
        };
    };
}
export declare function isNeedsBeginFrameChanged(event: Event): event is NeedsBeginFrameChanged;
export interface Commit extends Instant {
    name: Name.COMMIT;
    args: Args & {
        layerTreeId: number;
        frameSeqId: number;
    };
}
export declare function isCommit(event: Event): event is Commit;
export interface RasterTask extends Complete {
    name: Name.RASTER_TASK;
    args: Args & {
        tileData?: {
            layerId: number;
            sourceFrameNumber: number;
            tileId: {
                id_ref: string;
            };
            tileResolution: string;
        };
    };
}
export declare function isRasterTask(event: Event): event is RasterTask;
/** CompositeLayers has been replaced by "Commit", but we support both to not break old traces being imported. **/
export interface CompositeLayers extends Instant {
    name: Name.COMPOSITE_LAYERS;
    args: Args & {
        layerTreeId: number;
    };
}
export declare function isCompositeLayers(event: Event): event is CompositeLayers;
export interface ActivateLayerTree extends Instant {
    name: Name.ACTIVATE_LAYER_TREE;
    args: Args & {
        layerTreeId: number;
        frameId: number;
    };
}
export declare function isActivateLayerTree(event: Event): event is ActivateLayerTree;
export type InvalidationTrackingEvent = ScheduleStyleInvalidationTracking | StyleRecalcInvalidationTracking | StyleInvalidatorInvalidationTracking | LayoutInvalidationTracking;
export declare function isInvalidationTracking(event: Event): event is InvalidationTrackingEvent;
export interface DrawLazyPixelRef extends Instant {
    name: Name.DRAW_LAZY_PIXEL_REF;
    args?: Args & {
        LazyPixelRef: number;
    };
}
export declare function isDrawLazyPixelRef(event: Event): event is DrawLazyPixelRef;
export interface DecodeLazyPixelRef extends Instant {
    name: Name.DECODE_LAZY_PIXEL_REF;
    args?: Args & {
        LazyPixelRef: number;
    };
}
export declare function isDecodeLazyPixelRef(event: Event): event is DecodeLazyPixelRef;
export interface DecodeImage extends Complete {
    name: Name.DECODE_IMAGE;
    args: Args & {
        imageType: string;
    };
}
export declare function isDecodeImage(event: Event): event is DecodeImage;
export declare enum InvalidationEventType {
    StyleInvalidatorInvalidationTracking = "StyleInvalidatorInvalidationTracking",
    StyleRecalcInvalidationTracking = "StyleRecalcInvalidationTracking"
}
export interface SelectorTiming {
    'elapsed (us)': number;
    fast_reject_count: number;
    match_attempts: number;
    selector: string;
    style_sheet_id: string;
    match_count: number;
    invalidation_count: number;
}
export declare enum SelectorTimingsKey {
    Elapsed = "elapsed (us)",
    RejectPercentage = "reject_percentage",
    FastRejectCount = "fast_reject_count",
    MatchAttempts = "match_attempts",
    MatchCount = "match_count",
    Selector = "selector",
    StyleSheetId = "style_sheet_id",
    InvalidationCount = "invalidation_count"
}
export interface SelectorStatsData {
    selector_timings: SelectorTiming[];
}
export interface SelectorStats extends Complete {
    name: Name.SELECTOR_STATS;
    args: Args & {
        selector_stats?: SelectorStatsData;
    };
}
export declare function isSelectorStats(event: Event): event is SelectorStats;
export interface RecalcStyle extends Complete {
    name: Name.RECALC_STYLE;
    args: Args & {
        elementCount: number;
        beginData?: {
            frame: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
/** The real trace event is called 'UpdateLayoutTree' but we've aliased it for convenience. */
export declare function isRecalcStyle(event: Event): event is RecalcStyle;
export interface Layout extends Complete {
    name: Name.LAYOUT;
    args: Args & {
        beginData: {
            frame: string;
            dirtyObjects: number;
            partialLayout: boolean;
            totalObjects: number;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
        endData?: {
            layoutRoots: Array<{
                depth: number;
                nodeId: Protocol.DOM.BackendNodeId;
                quads: number[][];
            }>;
        };
    };
}
export declare function isLayout(event: Event): event is Layout;
export interface InvalidateLayout extends Instant {
    name: Name.INVALIDATE_LAYOUT;
    args: Args & {
        data: {
            frame: string;
            nodeId: Protocol.DOM.BackendNodeId;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export declare function isInvalidateLayout(event: Event): event is InvalidateLayout;
export interface DebuggerAsyncTaskScheduled extends Event {
    name: Name.DEBUGGER_ASYNC_TASK_SCHEDULED;
    args: Args & {
        taskName: string;
        data?: {
            sampleTraceId?: number;
        };
    };
}
export declare function isDebuggerAsyncTaskScheduled(event: Event): event is DebuggerAsyncTaskScheduled;
export interface DebuggerAsyncTaskRun extends Event {
    name: Name.DEBUGGER_ASYNC_TASK_RUN;
    args?: Args & {
        data?: {
            sampleTraceId?: number;
        };
    };
}
export declare function isDebuggerAsyncTaskRun(event: Event): event is DebuggerAsyncTaskRun;
export type ProfileID = Platform.Brand.Brand<string, 'profileIdTag'>;
export declare function ProfileID(value: string): ProfileID;
export type CallFrameID = Platform.Brand.Brand<number, 'callFrameIdTag'>;
export declare function CallFrameID(value: number): CallFrameID;
export type SampleIndex = Platform.Brand.Brand<number, 'sampleIndexTag'>;
export declare function SampleIndex(value: number): SampleIndex;
export type ProcessID = Platform.Brand.Brand<number, 'processIdTag'>;
export declare function ProcessID(value: number): ProcessID;
export type ThreadID = Platform.Brand.Brand<number, 'threadIdTag'>;
export declare function ThreadID(value: number): ThreadID;
export type WorkerId = Platform.Brand.Brand<string, 'workerIdTag'>;
export declare function WorkerId(value: string): WorkerId;
export declare function isComplete(event: Event): event is Complete;
export declare function isBegin(event: Event): event is Begin;
export declare function isEnd(event: Event): event is End;
export declare function isDispatch(event: Event): event is Dispatch;
export declare function isInstant(event: Event): event is Instant;
export declare function isRendererEvent(event: Event): event is RendererEvent;
export declare function isFireIdleCallback(event: Event): event is FireIdleCallback;
export declare function isSchedulePostMessage(event: Event): event is SchedulePostMessage;
export declare function isHandlePostMessage(event: Event): event is HandlePostMessage;
export declare function isUpdateCounters(event: Event): event is UpdateCounters;
export declare function isDOMStats(event: Event): event is DOMStats;
export declare function isThreadName(event: Event): event is ThreadName;
export declare function isProcessName(event: Event): event is ProcessName;
export declare function isTracingStartedInBrowser(event: Event): event is TracingStartedInBrowser;
export declare function isFrameCommittedInBrowser(event: Event): event is FrameCommittedInBrowser;
export declare function isCommitLoad(event: Event): event is CommitLoad;
export declare function isAnimation(event: Event): event is Animation;
export declare function isSyntheticAnimation(event: Event): event is SyntheticAnimationPair;
export declare function isLayoutShift(event: Event): event is LayoutShift;
export declare function isLayoutInvalidationTracking(event: Event): event is LayoutInvalidationTracking;
export declare function isFirstContentfulPaint(event: Event): event is FirstContentfulPaint;
export declare function isSoftFirstContentfulPaint(event: Event): event is SyntheticSoftFirstContentfulPaint;
export declare function isAnyFirstContentfulPaint(event: Event): event is AnyFirstContentfulPaint;
export declare function isLargestContentfulPaintCandidate(event: Event): event is LargestContentfulPaintCandidate;
export declare function isAnyLargestContentfulPaintCandidate(event: Event): event is AnyLargestContentfulPaintCandidate;
export declare function isSoftLargestContentfulPaintCandidate(event: Event): event is LargestContentfulPaintCandidateForSoftNavigation;
export declare function isLargestImagePaintCandidate(event: Event): event is LargestImagePaintCandidate;
export declare function isLargestTextPaintCandidate(event: Event): event is LargestTextPaintCandidate;
export declare function isMarkLoad(event: Event): event is MarkLoad;
export declare function isFirstPaint(event: Event): event is FirstPaint;
export declare function isMarkDOMContent(event: Event): event is MarkDOMContent;
export declare function isInteractiveTime(event: Event): event is InteractiveTime;
export declare function isEventTiming(event: Event): event is EventTimingBeginOrEnd;
export declare function isEventTimingEnd(event: Event): event is EventTimingEnd;
export declare function isEventTimingStart(event: Event): event is EventTimingBegin;
export declare function isGPUTask(event: Event): event is GPUTask;
export declare function isProfile(event: Event): event is Profile;
export declare function isSyntheticCpuProfile(event: Event): event is SyntheticCpuProfile;
export declare function isProfileChunk(event: Event): event is ProfileChunk;
export declare function isResourceChangePriority(event: Event): event is ResourceChangePriority;
export declare function isResourceSendRequest(event: Event): event is ResourceSendRequest;
export declare function isResourceReceiveResponse(event: Event): event is ResourceReceiveResponse;
export declare function isResourceMarkAsCached(event: Event): event is ResourceMarkAsCached;
export declare function isResourceFinish(event: Event): event is ResourceFinish;
export declare function isResourceWillSendRequest(event: Event): event is ResourceWillSendRequest;
export declare function isResourceReceivedData(event: Event): event is ResourceReceivedData;
/** Any event where we receive data (and get an encodedDataLength) **/
export declare function isReceivedDataEvent(event: Event): event is ResourceReceivedData | ResourceFinish | ResourceReceiveResponse;
export declare function isSyntheticNetworkRequest(event: Event): event is SyntheticNetworkRequest;
export declare function isSyntheticWebSocketConnection(event: Event): event is SyntheticWebSocketConnection;
export declare function isNetworkTrackEntry(event: Event): event is SyntheticWebSocketConnection | SyntheticNetworkRequest;
export declare function isPrePaint(event: Event): event is PrePaint;
/** A VALID navigation start (as it has a populated documentLoaderURL) */
export declare function isNavigationStart(event: Event): event is NavigationStart;
export interface DidCommitSameDocumentNavigation extends Complete {
    name: 'RenderFrameHostImpl::DidCommitSameDocumentNavigation';
    args: Args & {
        url: string;
        render_frame_host: {
            frame_type: string;
        };
    };
}
export declare function isDidCommitSameDocumentNavigation(event: Event): event is DidCommitSameDocumentNavigation;
export declare function isMainFrameViewport(event: Event): event is MainFrameViewport;
export declare function isSyntheticUserTiming(event: Event): event is SyntheticUserTimingPair;
export declare function isSyntheticConsoleTiming(event: Event): event is SyntheticConsoleTimingPair;
export declare function isUserTiming(event: Event): event is UserTiming;
export declare function isDomLoading(event: Event): event is DomLoading;
export declare function isBeginRemoteFontLoad(event: Event): event is BeginRemoteFontLoad;
export declare function isRemoteFontLoaded(event: Event): event is RemoteFontLoaded;
export declare function isPerformanceMeasure(event: Event): event is PerformanceMeasure;
export declare function isPerformanceMeasureBegin(event: Event): event is PerformanceMeasureBegin;
export declare function isPerformanceMark(event: Event): event is PerformanceMark;
export declare function isConsoleTime(event: Event): event is ConsoleTime;
export declare function isConsoleTimeStamp(event: Event): event is ConsoleTimeStamp;
export declare function isUserTimingMeasure(event: Event): event is UserTimingMeasure;
export declare function isParseHTML(event: Event): event is ParseHTML;
export interface Async extends Event {
    ph: Phase.ASYNC_NESTABLE_START | Phase.ASYNC_NESTABLE_INSTANT | Phase.ASYNC_NESTABLE_END | Phase.ASYNC_STEP_INTO | Phase.ASYNC_BEGIN | Phase.ASYNC_END | Phase.ASYNC_STEP_PAST;
}
export declare function isSyntheticLayoutShift(event: Event): event is SyntheticLayoutShift;
export declare function isSyntheticLayoutShiftCluster(event: Event): event is SyntheticLayoutShiftCluster;
export declare function isProfileCall(event: Event): event is SyntheticProfileCall;
export interface Paint extends Event {
    name: Name.PAINT;
    args: Args & {
        data: {
            layerId: number;
            frame: string;
            nodeId?: Protocol.DOM.BackendNodeId;
            nodeName?: string;
            /** This rect is unreliable and often wrong. We'll remove it. crbug.com/41402938#comment10 */
            clip?: number[];
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isPaint(event: Event): event is Paint;
export interface PaintImage extends Complete {
    name: Name.PAINT_IMAGE;
    args: Args & {
        data: {
            height: number;
            width: number;
            x: number;
            y: number;
            srcHeight: number;
            srcWidth: number;
            isCSS?: boolean;
            isPicture?: boolean;
            loadingAttribute?: string;
            srcsetAttribute?: string;
            url?: string;
            nodeId?: Protocol.DOM.BackendNodeId;
            nodeName?: string;
            frame?: string;
        };
    };
}
export declare function isPaintImage(event: Event): event is PaintImage;
export interface ScrollLayer extends Complete {
    name: Name.SCROLL_LAYER;
    args: Args & {
        data: {
            frame: string;
            nodeId?: Protocol.DOM.BackendNodeId;
        };
    };
}
export declare function isScrollLayer(event: Event): event is ScrollLayer;
export interface SetLayerTreeId extends Instant {
    name: Name.SET_LAYER_TREE_ID;
    args: Args & {
        data: {
            frame: string;
            layerTreeId: number;
        };
    };
}
export declare function isSetLayerId(event: Event): event is SetLayerTreeId;
export interface UpdateLayer extends Event {
    name: Name.UPDATE_LAYER;
    args: Args & {
        layerId: number;
        layerTreeId: number;
    };
}
export declare function isUpdateLayer(event: Event): event is UpdateLayer;
export interface LegacyDisplayItemListSnapshot extends Event {
    name: Name.LEGACY_DISPLAY_ITEM_LIST_SNAPSHOT;
    ph: Phase.OBJECT_SNAPSHOT;
    id2: {
        local?: string;
    };
    args: Args & {
        snapshot: {
            skp64: string;
            params?: {
                layer_rect: [number, number, number, number];
            };
        };
    };
}
export interface InstantDisplayItemListSnapshot extends Instant {
    name: Name.DISPLAY_ITEM_LIST_SNAPSHOT;
    args: Args & {
        snapshot: {
            skp64: string;
            params?: {
                layer_rect: [number, number, number, number];
            };
        };
    };
}
export type DisplayItemListSnapshot = LegacyDisplayItemListSnapshot | InstantDisplayItemListSnapshot;
export declare function isDisplayListItemListSnapshot(event: Event): event is DisplayItemListSnapshot;
export interface LayerTreeHostImplSnapshot extends Event {
    name: Name.LAYER_TREE_HOST_IMPL_SNAPSHOT;
    ph: Phase.OBJECT_SNAPSHOT;
    id: string;
    args: Args & {
        snapshot: {
            active_tiles: Array<{
                id: string;
                layer_id: string;
                gpu_memory_usage: number;
                content_rect: number[];
            }>;
            device_viewport_size: {
                width: number;
                height: number;
            };
            active_tree: {
                root_layer: TraceLayer;
                layers: TraceLayer[];
            };
        };
    };
}
export declare function isLayerTreeHostImplSnapshot(event: Event): event is LayerTreeHostImplSnapshot;
export interface TraceLayer {
    bounds: {
        height: number;
        width: number;
    };
    children: TraceLayer[];
    layer_id: number;
    position: number[];
    scroll_offset: number[];
    layer_quad: number[];
    draws_content: number;
    gpu_memory_usage: number;
    transform: number[];
    owner_node: Protocol.DOM.BackendNodeId;
    compositing_reasons: string[];
    compositing_reason_ids: string[];
    non_fast_scrollable_region: number[];
    touch_event_handler_region: number[];
    wheel_event_handler_region: number[];
    scroll_event_handler_region: number[];
}
export interface TracingLayerTile {
    id: string;
    layer_id: string;
    gpu_memory_usage: number;
    content_rect: number[];
}
export interface FireAnimationFrame extends Complete {
    name: Name.FIRE_ANIMATION_FRAME;
    args: Args & {
        data: {
            id: number;
            frame?: string;
            sampleTraceId?: number;
        };
    };
}
export declare function isFireAnimationFrame(event: Event): event is FireAnimationFrame;
export interface RequestAnimationFrame extends Instant {
    name: Name.REQUEST_ANIMATION_FRAME;
    args: Args & {
        data: {
            id: number;
            frame?: string;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export interface TimerInstall extends Instant {
    name: Name.TIMER_INSTALL;
    args: Args & {
        data: {
            singleShot: boolean;
            timeout: number;
            timerId: number;
            frame?: string;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export declare function isTimerInstall(event: Event): event is TimerInstall;
export interface TimerFire extends Complete {
    name: Name.TIMER_FIRE;
    args: Args & {
        data: {
            timerId: number;
            frame?: string;
        };
    };
}
export declare function isTimerFire(event: Event): event is TimerFire;
export interface RequestIdleCallback extends Instant {
    name: Name.REQUEST_IDLE_CALLBACK;
    args: Args & {
        data: {
            frame: string;
            id: number;
            timeout: Milli;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isRequestIdleCallback(event: Event): event is RequestIdleCallback;
export interface WebSocketCreate extends Instant {
    name: Name.WEB_SOCKET_CREATE;
    args: Args & {
        data: {
            identifier: number;
            url: string;
            frame?: string;
            workerId?: string;
            webSocketProtocol?: string;
            stackTrace?: CallFrame[];
            sampleTraceId?: number;
        };
    };
}
export declare function isWebSocketCreate(event: Event): event is WebSocketCreate;
export interface WebSocketInfo extends Instant {
    name: Name.WEB_SOCKET_DESTROY | Name.WEB_SOCKET_SEND_HANDSHAKE_REQUEST | Name.WEB_SOCKET_RECEIVE_HANDSHAKE | Name.WEB_SOCKET_RECEIVE_HANDSHAKE_REQUEST;
    args: Args & {
        data: {
            identifier: number;
            frame?: string;
            workerId?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export interface WebSocketTransfer extends Instant {
    name: Name.WEB_SOCKET_SEND | Name.WEB_SOCKET_RECEIVE;
    args: Args & {
        data: {
            identifier: number;
            dataLength: number;
            frame?: string;
            workerId?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isWebSocketInfo(event: Event): event is WebSocketInfo;
export declare function isWebSocketTransfer(event: Event): event is WebSocketTransfer;
export interface WebSocketSend extends Instant {
    name: Name.WEB_SOCKET_SEND;
    args: Args & {
        data: {
            identifier: number;
            dataLength: number;
            frame?: string;
            workerId?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export interface WebSocketReceive extends Instant {
    name: Name.WEB_SOCKET_RECEIVE;
    args: Args & {
        data: {
            identifier: number;
            dataLength: number;
            frame?: string;
            workerId?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export interface WebSocketSendHandshakeRequest extends Instant {
    name: Name.WEB_SOCKET_SEND_HANDSHAKE_REQUEST;
    args: Args & {
        data: {
            identifier: number;
            frame?: string;
            workerId?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isWebSocketSendHandshakeRequest(event: Event): event is WebSocketSendHandshakeRequest;
export interface WebSocketReceiveHandshakeResponse extends Instant {
    name: Name.WEB_SOCKET_RECEIVE_HANDSHAKE_REQUEST;
    args: Args & {
        data: {
            identifier: number;
            frame?: string;
            workerId?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isWebSocketReceiveHandshakeResponse(event: Event): event is WebSocketReceiveHandshakeResponse;
export interface WebSocketDestroy extends Instant {
    name: Name.WEB_SOCKET_DESTROY;
    args: Args & {
        data: {
            identifier: number;
            frame?: string;
            workerId?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isWebSocketDestroy(event: Event): event is WebSocketDestroy;
export type WebSocketTraceEvent = WebSocketCreate | WebSocketInfo | WebSocketTransfer;
export declare function isWebSocketTraceEvent(event: Event): event is WebSocketTraceEvent;
export type WebSocketEvent = WebSocketTraceEvent | SyntheticWebSocketConnection;
export declare function isWebSocketEvent(event: Event): event is WebSocketTraceEvent | SyntheticWebSocketConnection;
export interface V8Compile extends Complete {
    name: Name.COMPILE;
    args: Args & {
        data?: {
            url?: string;
            columnNumber?: number;
            consumedCacheSize?: number;
            cacheRejected?: boolean;
            cacheKind?: 'full' | 'normal';
            lineNumber?: number;
            notStreamedReason?: string;
            streamed?: boolean;
            eager?: boolean;
        };
        fileName?: string;
    };
}
export declare function isV8Compile(event: Event): event is V8Compile;
export interface FunctionCall extends Complete {
    name: Name.FUNCTION_CALL;
    args: Args & {
        data?: Partial<CallFrame> & {
            frame?: string;
            isolate?: string | number;
            scriptId?: string;
            sampleTraceId?: number;
        };
    };
}
export declare function isFunctionCall(event: Event): event is FunctionCall;
export interface SchedulePostTaskCallback extends Instant {
    name: Name.SCHEDULE_POST_TASK_CALLBACK;
    args: Args & {
        data: {
            taskId: number;
            priority: 'user-blocking' | 'user-visible' | 'background';
            delay?: Milli;
            frame?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isSchedulePostTaskCallback(event: Event): event is SchedulePostTaskCallback;
export interface RunPostTaskCallback extends Complete {
    name: Name.RUN_POST_TASK_CALLBACK;
    args: Args & {
        data: {
            taskId: number;
            priority: 'user-blocking' | 'user-visible' | 'background';
            delay?: Milli;
            frame?: string;
        };
    };
}
export declare function isRunPostTaskCallback(event: Event): event is RunPostTaskCallback;
export interface AbortPostTaskCallback extends Complete {
    name: Name.ABORT_POST_TASK_CALLBACK;
    args: Args & {
        data: {
            taskId: number;
            frame?: string;
            sampleTraceId?: number;
            stackTrace?: CallFrame[];
        };
    };
}
export declare function isAbortPostTaskCallback(event: Event): event is AbortPostTaskCallback;
/**
 * Generally, before JS is executed, a trace event is dispatched that
 * parents the JS calls. These we call "invocation" events. This
 * function determines if an event is one of such. Note: these are also
 * commonly referred to as "JS entry points".
 */
export declare function isJSInvocationEvent(event: Event): boolean;
export interface ConsoleRunTask extends Event {
    args: Args & {
        data?: {
            sampleTraceId?: number;
        };
    };
    name: Name.V8_CONSOLE_RUN_TASK;
}
export declare function isConsoleRunTask(event: Event): event is ConsoleRunTask;
export interface FlowEvent extends Event {
    id: number;
    ph: Phase.FLOW_START | Phase.FLOW_END | Phase.FLOW_STEP;
}
export declare function isFlowPhaseEvent(event: Event): event is FlowEvent;
export interface ParseAuthorStyleSheet extends Complete {
    name: Name.PARSE_AUTHOR_STYLE_SHEET;
    args?: Args & {
        data: {
            styleSheetUrl: string;
        };
    };
}
export declare function isParseAuthorStyleSheetEvent(event: Event): event is ParseAuthorStyleSheet;
/**
 * This is an exhaustive list of events we track in the Performance
 * panel. Note not all of them are necessarliry shown in the flame
 * chart, some of them we only use for parsing.
 * TODO(crbug.com/1428024): Complete this enum.
 */
export declare enum Name {
    THREAD_NAME = "thread_name",
    PROGRAM = "Program",
    RUN_TASK = "RunTask",
    ASYNC_TASK = "AsyncTask",
    RUN_MICROTASKS = "RunMicrotasks",
    XHR_LOAD = "XHRLoad",
    XHR_READY_STATE_CHANGED = "XHRReadyStateChange",
    PARSE_HTML = "ParseHTML",
    PARSE_CSS = "ParseAuthorStyleSheet",
    COMPILE_CODE = "V8.CompileCode",
    COMPILE_MODULE = "V8.CompileModule",
    COMPILE = "v8.compile",
    COMPILE_SCRIPT = "V8.CompileScript",
    OPTIMIZE = "V8.OptimizeCode",
    WASM_STREAM_FROM_RESPONSE_CALLBACK = "v8.wasm.streamFromResponseCallback",
    WASM_COMPILED_MODULE = "v8.wasm.compiledModule",
    WASM_CACHED_MODULE = "v8.wasm.cachedModule",
    WASM_MODULE_CACHE_HIT = "v8.wasm.moduleCacheHit",
    WASM_MODULE_CACHE_INVALID = "v8.wasm.moduleCacheInvalid",
    PROFILE_CALL = "ProfileCall",
    EVALUATE_SCRIPT = "EvaluateScript",
    FUNCTION_CALL = "FunctionCall",
    EVENT_DISPATCH = "EventDispatch",
    EVALUATE_MODULE = "v8.evaluateModule",
    REQUEST_MAIN_THREAD_FRAME = "RequestMainThreadFrame",
    REQUEST_ANIMATION_FRAME = "RequestAnimationFrame",
    CANCEL_ANIMATION_FRAME = "CancelAnimationFrame",
    FIRE_ANIMATION_FRAME = "FireAnimationFrame",
    REQUEST_IDLE_CALLBACK = "RequestIdleCallback",
    CANCEL_IDLE_CALLBACK = "CancelIdleCallback",
    FIRE_IDLE_CALLBACK = "FireIdleCallback",
    TIMER_INSTALL = "TimerInstall",
    TIMER_REMOVE = "TimerRemove",
    TIMER_FIRE = "TimerFire",
    WEB_SOCKET_CREATE = "WebSocketCreate",
    WEB_SOCKET_SEND_HANDSHAKE = "WebSocketSendHandshakeRequest",
    WEB_SOCKET_RECEIVE_HANDSHAKE = "WebSocketReceiveHandshakeResponse",
    WEB_SOCKET_DESTROY = "WebSocketDestroy",
    WEB_SOCKET_SEND = "WebSocketSend",
    WEB_SOCKET_RECEIVE = "WebSocketReceive",
    CRYPTO_DO_ENCRYPT = "DoEncrypt",
    CRYPTO_DO_ENCRYPT_REPLY = "DoEncryptReply",
    CRYPTO_DO_DECRYPT = "DoDecrypt",
    CRYPTO_DO_DECRYPT_REPLY = "DoDecryptReply",
    CRYPTO_DO_DIGEST = "DoDigest",
    CRYPTO_DO_DIGEST_REPLY = "DoDigestReply",
    CRYPTO_DO_SIGN = "DoSign",
    CRYPTO_DO_SIGN_REPLY = "DoSignReply",
    CRYPTO_DO_VERIFY = "DoVerify",
    CRYPTO_DO_VERIFY_REPLY = "DoVerifyReply",
    V8_EXECUTE = "V8.Execute",
    V8_CONSOLE_RUN_TASK = "V8Console::runTask",
    SCHEDULE_POST_TASK_CALLBACK = "SchedulePostTaskCallback",
    RUN_POST_TASK_CALLBACK = "RunPostTaskCallback",
    ABORT_POST_TASK_CALLBACK = "AbortPostTaskCallback",
    DEBUGGER_ASYNC_TASK_RUN = "v8::Debugger::AsyncTaskRun",
    DEBUGGER_ASYNC_TASK_SCHEDULED = "v8::Debugger::AsyncTaskScheduled",
    GC = "GCEvent",
    DOMGC = "BlinkGC.AtomicPhase",
    MAJOR_GC = "MajorGC",
    MINOR_GC = "MinorGC",
    GC_COLLECT_GARBARGE = "BlinkGC.AtomicPhase",
    CPPGC_SWEEP = "CppGC.IncrementalSweep",
    SCHEDULE_STYLE_RECALCULATION = "ScheduleStyleRecalculation",
    LAYOUT = "Layout",
    /** The real trace event is called 'UpdateLayoutTree' but we've aliased it for convenience. */
    RECALC_STYLE = "UpdateLayoutTree",
    INVALIDATE_LAYOUT = "InvalidateLayout",
    LAYOUT_INVALIDATION_TRACKING = "LayoutInvalidationTracking",
    COMPUTE_INTERSECTION = "ComputeIntersections",
    HIT_TEST = "HitTest",
    PRE_PAINT = "PrePaint",
    LAYERIZE = "Layerize",
    LAYOUT_SHIFT = "LayoutShift",
    SYNTHETIC_LAYOUT_SHIFT = "SyntheticLayoutShift",
    SYNTHETIC_LAYOUT_SHIFT_CLUSTER = "SyntheticLayoutShiftCluster",
    UPDATE_LAYER_TREE = "UpdateLayerTree",
    SCHEDULE_STYLE_INVALIDATION_TRACKING = "ScheduleStyleInvalidationTracking",
    STYLE_RECALC_INVALIDATION_TRACKING = "StyleRecalcInvalidationTracking",
    STYLE_INVALIDATOR_INVALIDATION_TRACKING = "StyleInvalidatorInvalidationTracking",
    SELECTOR_STATS = "SelectorStats",
    BEGIN_COMMIT_COMPOSITOR_FRAME = "BeginCommitCompositorFrame",
    PARSE_META_VIEWPORT = "ParseMetaViewport",
    META_CHARSET_CHECK = "MetaCharsetCheck",
    SCROLL_LAYER = "ScrollLayer",
    UPDATE_LAYER = "UpdateLayer",
    PAINT_SETUP = "PaintSetup",
    PAINT = "Paint",
    PAINT_IMAGE = "PaintImage",
    COMMIT = "Commit",
    COMPOSITE_LAYERS = "CompositeLayers",
    RASTER_TASK = "RasterTask",
    IMAGE_DECODE_TASK = "ImageDecodeTask",
    IMAGE_UPLOAD_TASK = "ImageUploadTask",
    DECODE_IMAGE = "Decode Image",
    DRAW_LAZY_PIXEL_REF = "Draw LazyPixelRef",
    DECODE_LAZY_PIXEL_REF = "Decode LazyPixelRef",
    GPU_TASK = "GPUTask",
    RASTERIZE = "Rasterize",
    EVENT_TIMING = "EventTiming",
    OPTIMIZE_CODE = "V8.OptimizeCode",
    CACHE_SCRIPT = "v8.produceCache",
    CACHE_MODULE = "v8.produceModuleCache",
    V8_SAMPLE = "V8Sample",
    JIT_CODE_ADDED = "JitCodeAdded",
    JIT_CODE_MOVED = "JitCodeMoved",
    STREAMING_COMPILE_SCRIPT = "v8.parseOnBackground",
    STREAMING_COMPILE_SCRIPT_WAITING = "v8.parseOnBackgroundWaiting",
    STREAMING_COMPILE_SCRIPT_PARSING = "v8.parseOnBackgroundParsing",
    BACKGROUND_DESERIALIZE = "v8.deserializeOnBackground",
    FINALIZE_DESERIALIZATION = "V8.FinalizeDeserialization",
    COMMIT_LOAD = "CommitLoad",
    MARK_LOAD = "MarkLoad",
    MARK_DOM_CONTENT = "MarkDOMContent",
    MARK_FIRST_PAINT = "firstPaint",
    MARK_FCP = "firstContentfulPaint",
    MARK_SOFT_FCP = "SyntheticSoftFirstContentfulPaint",
    MARK_LCP_CANDIDATE = "largestContentfulPaint::Candidate",
    MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION = "largestContentfulPaint::CandidateForSoftNavigation",
    MARK_LCP_INVALIDATE = "largestContentfulPaint::Invalidate",
    NAVIGATION_START = "navigationStart",
    SOFT_NAVIGATION_START = "SoftNavigationStart",
    CONSOLE_TIME = "ConsoleTime",
    USER_TIMING = "UserTiming",
    INTERACTIVE_TIME = "InteractiveTime",
    TIME_STAMP = "TimeStamp",
    BEGIN_FRAME = "BeginFrame",
    NEEDS_BEGIN_FRAME_CHANGED = "NeedsBeginFrameChanged",
    BEGIN_MAIN_THREAD_FRAME = "BeginMainThreadFrame",
    ACTIVATE_LAYER_TREE = "ActivateLayerTree",
    DRAW_FRAME = "DrawFrame",
    DROPPED_FRAME = "DroppedFrame",
    FRAME_STARTED_LOADING = "FrameStartedLoading",
    PIPELINE_REPORTER = "PipelineReporter",
    SCREENSHOT = "Screenshot",
    RESOURCE_WILL_SEND_REQUEST = "ResourceWillSendRequest",
    RESOURCE_SEND_REQUEST = "ResourceSendRequest",
    RESOURCE_RECEIVE_RESPONSE = "ResourceReceiveResponse",
    RESOURCE_RECEIVE_DATA = "ResourceReceivedData",
    RESOURCE_FINISH = "ResourceFinish",
    RESOURCE_MARK_AS_CACHED = "ResourceMarkAsCached",
    WEB_SOCKET_SEND_HANDSHAKE_REQUEST = "WebSocketSendHandshakeRequest",
    WEB_SOCKET_RECEIVE_HANDSHAKE_REQUEST = "WebSocketReceiveHandshakeResponse",
    CPU_PROFILE = "CpuProfile",
    PROFILE = "Profile",
    START_PROFILING = "CpuProfiler::StartProfiling",
    PROFILE_CHUNK = "ProfileChunk",
    UPDATE_COUNTERS = "UpdateCounters",
    JS_SAMPLE = "JSSample",
    ANIMATION = "Animation",
    PARSE_AUTHOR_STYLE_SHEET = "ParseAuthorStyleSheet",
    EMBEDDER_CALLBACK = "EmbedderCallback",
    SET_LAYER_TREE_ID = "SetLayerTreeId",
    TRACING_STARTED_IN_PAGE = "TracingStartedInPage",
    TRACING_STARTED_IN_BROWSER = "TracingStartedInBrowser",
    TRACING_SESSION_ID_FOR_WORKER = "TracingSessionIdForWorker",
    LAZY_PIXEL_REF = "LazyPixelRef",
    LAYER_TREE_HOST_IMPL_SNAPSHOT = "cc::LayerTreeHostImpl",
    PICTURE_SNAPSHOT = "cc::Picture",
    LEGACY_DISPLAY_ITEM_LIST_SNAPSHOT = "cc::DisplayItemList",
    DISPLAY_ITEM_LIST_SNAPSHOT = "cc::DisplayItemList:snapshot",
    INPUT_LATENCY_MOUSE_MOVE = "InputLatency::MouseMove",
    INPUT_LATENCY_MOUSE_WHEEL = "InputLatency::MouseWheel",
    IMPL_SIDE_FLING = "InputHandlerProxy::HandleGestureFling::started",
    SCHEDULE_POST_MESSAGE = "SchedulePostMessage",
    HANDLE_POST_MESSAGE = "HandlePostMessage",
    RENDER_FRAME_IMPL_CREATE_CHILD_FRAME = "RenderFrameImpl::createChildFrame",
    LAYOUT_IMAGE_UNSIZED = "LayoutImageUnsized",
    DOM_LOADING = "domLoading",
    BEGIN_REMOTE_FONT_LOAD = "BeginRemoteFontLoad",
    REMOTE_FONT_LOADED = "RemoteFontLoaded",
    ANIMATION_FRAME = "AnimationFrame",
    ANIMATION_FRAME_PRESENTATION = "AnimationFrame::Presentation",
    SYNTHETIC_NETWORK_REQUEST = "SyntheticNetworkRequest",
    USER_TIMING_MEASURE = "UserTiming::Measure",
    LINK_PRECONNECT = "LinkPreconnect",
    PRELOAD_RENDER_BLOCKING_STATUS_CHANGE = "PreloadRenderBlockingStatusChange"
}
export type MarkerEventName = Name.MARK_DOM_CONTENT | Name.MARK_LOAD | Name.MARK_FIRST_PAINT | Name.MARK_FCP | Name.MARK_SOFT_FCP | Name.MARK_LCP_CANDIDATE | Name.MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION | Name.NAVIGATION_START | Name.SOFT_NAVIGATION_START;
export declare const MarkerName: readonly MarkerEventName[];
export interface MarkerEvent extends Event {
    name: MarkerEventName;
}
/**
 * NOT AN EXHAUSTIVE LIST: just some categories we use and refer
 * to in multiple places.
 **/
export declare const Categories: {
    readonly Console: 'blink.console';
    readonly UserTiming: 'blink.user_timing';
    readonly Loading: 'loading';
};
export declare const DefaultCategories: readonly ['blink.console', 'blink.user_timing', 'loading', 'devtools.timeline', 'disabled-by-default-devtools.target-rundown', 'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.v8-source-rundown-sources', 'disabled-by-default-devtools.v8-source-rundown', 'disabled-by-default-layout_shift.debug', 'disabled-by-default-v8.inspector', 'disabled-by-default-v8.cpu_profiler.hires', 'disabled-by-default-lighthouse', 'v8.execute', 'v8', 'cppgc', 'navigation,rail'];
export declare const OptionalCategories: {
    readonly JsSampling: readonly ['disabled-by-default-v8.cpu_profiler'];
    readonly InvalidationTracking: readonly ['disabled-by-default-devtools.timeline.invalidationTracking'];
    readonly AdvancedPaint: readonly ['disabled-by-default-devtools.timeline.layers', 'disabled-by-default-devtools.timeline.picture', 'disabled-by-default-blink.graphics_context_annotations'];
    readonly Screenshot: readonly ['disabled-by-default-devtools.screenshot'];
    readonly CssSelectorStats: readonly ['disabled-by-default-blink.debug', 'disabled-by-default-devtools.timeline.invalidationTracking'];
};
/**
 * The frames implementation in handlers/FramesHandler is considered "legacy"
 * in that it is based on the old TimelineModel implementation rather than
 * following the pattern of the other handlers. This will change in time as we
 * migrate the frames track to use AnimationFrame events, but for now we
 * maintain it because the effort required to migrate was large.
 * Consequently, the types we use through the codebase to refer to these frames
 * usually use ModelHandlers.FramesHandler.TimelineFrame, but in
 * trace/types/*.ts we cannot refer to types defined in the Handlers. To avoid a
 * circular dependency, we define these interfaces here which are implemented by
 * the classes in FramesHandler.ts, but they can also be used to refer to
 * instances of frames in trace/types/*.ts which is unable to import from
 * handlers.
 */
export interface LegacyTimelineFrame extends Event {
    startTime: Micro;
    startTimeOffset: Micro;
    endTime: Micro;
    duration: Micro;
    idle: boolean;
    dropped: boolean;
    isPartial: boolean;
    layerTree: LegacyFrameLayerTreeData | null;
    paints: LegacyLayerPaintEvent[];
    mainFrameId?: number;
    readonly seqId: number;
    index: number;
}
export declare function isLegacyTimelineFrame(data: Event): data is LegacyTimelineFrame;
export interface LegacyFrameLayerTreeData {
    entry: LayerTreeHostImplSnapshot;
    paints: LegacyLayerPaintEvent[];
}
export interface LegacyLayerPaintEvent {
    layerId(): number;
    event(): Paint;
    picture(): LegacyLayerPaintEventPicture | null;
}
export interface LegacyLayerPaintEventPicture {
    rect: number[];
    serializedPicture: string;
}
/** Same as `TraceEventTargetRundown` in `EnhancedTracesParser` */
export interface RundownScriptCompiled extends Event {
    cat: 'disabled-by-default-devtools.target-rundown';
    name: SDK.EnhancedTracesParser.RundownScriptCompiled['name'];
    args: Args & {
        data?: SDK.EnhancedTracesParser.RundownScriptCompiled['args']['data'];
    };
}
export declare function isRundownScriptCompiled(event: Event): event is RundownScriptCompiled;
/** Same as `TraceEventScriptRundown` in `EnhancedTracesParser` */
export interface RundownScript extends Event {
    cat: 'disabled-by-default-devtools.v8-source-rundown';
    name: SDK.EnhancedTracesParser.RundownScript['name'];
    args: Args & {
        data: SDK.EnhancedTracesParser.RundownScript['args']['data'];
    };
}
export declare function isRundownScript(event: Event): event is RundownScript;
/** Same as `TraceEventScriptRundownSource` in `EnhancedTracesParser` */
export interface RundownScriptSource extends Event {
    cat: 'disabled-by-default-devtools.v8-source-rundown-sources';
    name: 'ScriptCatchup';
    args: Args & {
        data: SDK.EnhancedTracesParser.RundownScriptSource['args']['data'];
    };
}
export declare function isRundownScriptSource(event: Event): event is RundownScriptSource;
export interface RundownScriptSourceLarge extends Event {
    cat: 'disabled-by-default-devtools.v8-source-rundown-sources';
    name: 'LargeScriptCatchup';
    args: Args & {
        data: {
            isolate: string | number;
            scriptId: number;
            splitIndex: number;
            splitCount: number;
            sourceText: string;
        };
    };
}
export declare function isRundownScriptSourceLarge(event: Event): event is RundownScriptSourceLarge;
export interface RundownScriptStub extends Event {
    cat: 'disabled-by-default-devtools.v8-source-rundown-sources';
    name: 'StubScriptCatchup';
    args: Args & {
        data: {
            isolate: string | number;
            scriptId: number;
        };
    };
}
export declare function isAnyScriptSourceEvent(event: Event): event is RundownScriptSource | RundownScriptSourceLarge | RundownScriptStub;
export interface PreloadRenderBlockingStatusChangeEvent extends Instant {
    name: Name.PRELOAD_RENDER_BLOCKING_STATUS_CHANGE;
    cat: 'devtools.timeline';
    args: Args & {
        data: {
            requestId: string;
            url: string;
            renderBlocking?: RenderBlocking;
        };
    };
}
export declare function isPreloadRenderBlockingStatusChangeEvent(event: Event): event is PreloadRenderBlockingStatusChangeEvent;
export {};
