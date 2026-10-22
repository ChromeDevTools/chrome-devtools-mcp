// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/** Trace Events. **/
export var Phase;
(function (Phase) {
    // Standard
    Phase["BEGIN"] = "B";
    Phase["END"] = "E";
    Phase["COMPLETE"] = "X";
    Phase["INSTANT"] = "I";
    Phase["COUNTER"] = "C";
    // Async
    Phase["ASYNC_NESTABLE_START"] = "b";
    Phase["ASYNC_NESTABLE_INSTANT"] = "n";
    Phase["ASYNC_NESTABLE_END"] = "e";
    Phase["ASYNC_STEP_INTO"] = "T";
    Phase["ASYNC_BEGIN"] = "S";
    Phase["ASYNC_END"] = "F";
    Phase["ASYNC_STEP_PAST"] = "p";
    // Flow
    Phase["FLOW_START"] = "s";
    Phase["FLOW_STEP"] = "t";
    Phase["FLOW_END"] = "f";
    // Sample
    Phase["SAMPLE"] = "P";
    // Object
    Phase["OBJECT_CREATED"] = "N";
    Phase["OBJECT_SNAPSHOT"] = "O";
    Phase["OBJECT_DESTROYED"] = "D";
    // Metadata
    Phase["METADATA"] = "M";
    // Memory Dump
    Phase["MEMORY_DUMP_GLOBAL"] = "V";
    Phase["MEMORY_DUMP_PROCESS"] = "v";
    // Mark
    Phase["MARK"] = "R";
    // Clock sync
    Phase["CLOCK_SYNC"] = "c";
})(Phase || (Phase = {}));
export function isNestableAsyncPhase(phase) {
    return phase === Phase.ASYNC_NESTABLE_START || phase === Phase.ASYNC_NESTABLE_END ||
        phase === Phase.ASYNC_NESTABLE_INSTANT;
}
export function isPhaseAsync(phase) {
    return isNestableAsyncPhase(phase) || phase === Phase.ASYNC_BEGIN || phase === Phase.ASYNC_STEP_INTO ||
        phase === Phase.ASYNC_END || phase === Phase.ASYNC_STEP_PAST;
}
export function isFlowPhase(phase) {
    return phase === Phase.FLOW_START || phase === Phase.FLOW_STEP || phase === Phase.FLOW_END;
}
export var Scope;
(function (Scope) {
    Scope["THREAD"] = "t";
    Scope["PROCESS"] = "p";
    Scope["GLOBAL"] = "g";
})(Scope || (Scope = {}));
export function objectIsEvent(obj) {
    return 'cat' in obj && 'name' in obj && 'ts' in obj;
}
export function objectIsCallFrame(object) {
    return ('functionName' in object && typeof object.functionName === 'string') &&
        ('scriptId' in object && (typeof object.scriptId === 'string' || typeof object.scriptId === 'number')) &&
        ('columnNumber' in object && typeof object.columnNumber === 'number') &&
        ('lineNumber' in object && typeof object.lineNumber === 'number') &&
        ('url' in object && typeof object.url === 'string');
}
export const VALID_PROFILE_SOURCES = ['Inspector', 'SelfProfiling', 'Internal'];
export function isRunTask(event) {
    return event.name === Name.RUN_TASK && event.ph === Phase.COMPLETE;
}
export var AuctionWorkletType;
(function (AuctionWorkletType) {
    AuctionWorkletType["BIDDER"] = "bidder";
    AuctionWorkletType["SELLER"] = "seller";
    // Not expected to be used, but here as a fallback in case new types get
    // added and we have yet to update the trace engine.
    AuctionWorkletType["UNKNOWN"] = "unknown";
})(AuctionWorkletType || (AuctionWorkletType = {}));
export function isAuctionWorkletRunningInProcess(event) {
    return event.name === 'AuctionWorkletRunningInProcess';
}
export function isAuctionWorkletDoneWithProcess(event) {
    return event.name === 'AuctionWorkletDoneWithProcess';
}
export function isLegacyScreenshot(event) {
    return event.name === Name.SCREENSHOT && 'id' in event;
}
export function isLegacySyntheticScreenshot(event) {
    return event.name === Name.SCREENSHOT && 'dataUri' in (event.args ?? {});
}
export function isScreenshot(event) {
    return event.name === Name.SCREENSHOT && 'source_id' in (event.args ?? {});
}
export function isSoftNavigationStart(event) {
    return event.name === Name.SOFT_NAVIGATION_START;
}
const markerTypeGuards = [
    isMarkDOMContent,
    isMarkLoad,
    isFirstPaint,
    isAnyFirstContentfulPaint,
    isAnyLargestContentfulPaintCandidate,
    isNavigationStart,
    isSoftNavigationStart,
];
export function isMarkerEvent(event) {
    if (event.ph === Phase.INSTANT || Phase.ASYNC_NESTABLE_INSTANT || event.ph === Phase.MARK) {
        return markerTypeGuards.some(fn => fn(event));
    }
    return false;
}
const pageLoadEventTypeGuards = [
    ...markerTypeGuards,
    isInteractiveTime,
];
export function eventIsPageLoadEvent(event) {
    if (event.ph === Phase.INSTANT || Phase.ASYNC_NESTABLE_INSTANT || event.ph === Phase.MARK) {
        return pageLoadEventTypeGuards.some(fn => fn(event));
    }
    return false;
}
export function isTracingSessionIdForWorker(event) {
    return event.name === 'TracingSessionIdForWorker';
}
export const NO_NAVIGATION = 'NO_NAVIGATION';
export var LayoutInvalidationReason;
(function (LayoutInvalidationReason) {
    LayoutInvalidationReason["SIZE_CHANGED"] = "Size changed";
    LayoutInvalidationReason["ATTRIBUTE"] = "Attribute";
    LayoutInvalidationReason["ADDED_TO_LAYOUT"] = "Added to layout";
    LayoutInvalidationReason["SCROLLBAR_CHANGED"] = "Scrollbar changed";
    LayoutInvalidationReason["REMOVED_FROM_LAYOUT"] = "Removed from layout";
    LayoutInvalidationReason["STYLE_CHANGED"] = "Style changed";
    LayoutInvalidationReason["FONTS_CHANGED"] = "Fonts changed";
    LayoutInvalidationReason["UNKNOWN"] = "Unknown";
})(LayoutInvalidationReason || (LayoutInvalidationReason = {}));
export function isScheduleStyleInvalidationTracking(event) {
    return event.name === Name.SCHEDULE_STYLE_INVALIDATION_TRACKING;
}
export var StyleRecalcInvalidationReason;
(function (StyleRecalcInvalidationReason) {
    StyleRecalcInvalidationReason["ANIMATION"] = "Animation";
    StyleRecalcInvalidationReason["RELATED_STYLE_RULE"] = "Related style rule";
})(StyleRecalcInvalidationReason || (StyleRecalcInvalidationReason = {}));
export function isStyleRecalcInvalidationTracking(event) {
    return event.name === Name.STYLE_RECALC_INVALIDATION_TRACKING;
}
export function isStyleInvalidatorInvalidationTracking(event) {
    return event.name === Name.STYLE_INVALIDATOR_INVALIDATION_TRACKING;
}
export function isBeginCommitCompositorFrame(event) {
    return event.name === Name.BEGIN_COMMIT_COMPOSITOR_FRAME;
}
export function isParseMetaViewport(event) {
    return event.name === Name.PARSE_META_VIEWPORT;
}
export function isMetaCharsetCheck(event) {
    return event.name === Name.META_CHARSET_CHECK;
}
export function isLinkPreconnect(event) {
    return event.name === Name.LINK_PRECONNECT;
}
export function isScheduleStyleRecalculation(event) {
    return event.name === Name.SCHEDULE_STYLE_RECALCULATION;
}
export function isRenderFrameImplCreateChildFrame(event) {
    return event.name === Name.RENDER_FRAME_IMPL_CREATE_CHILD_FRAME;
}
export function isLayoutImageUnsized(event) {
    return event.name === Name.LAYOUT_IMAGE_UNSIZED;
}
export function isPairableAsyncBegin(e) {
    return e.ph === Phase.ASYNC_NESTABLE_START;
}
export function isPairableAsyncEnd(e) {
    return e.ph === Phase.ASYNC_NESTABLE_END;
}
export function isPairableAsyncInstant(e) {
    return e.ph === Phase.ASYNC_NESTABLE_INSTANT;
}
export function isAnimationFrameAsyncStart(data) {
    return data.name === Name.ANIMATION_FRAME && data.ph === Phase.ASYNC_NESTABLE_START;
}
export function isAnimationFrameAsyncEnd(data) {
    return data.name === Name.ANIMATION_FRAME && data.ph === Phase.ASYNC_NESTABLE_END;
}
export function isAnimationFramePresentation(data) {
    return data.name === Name.ANIMATION_FRAME_PRESENTATION;
}
var State;
(function (State) {
    /** The frame did not have any updates to present. **/
    State["STATE_NO_UPDATE_DESIRED"] = "STATE_NO_UPDATE_DESIRED";
    /**
     * The frame presented all the desired updates (i.e. any updates requested
     * from both the compositor thread and main-threads were handled). *
     */
    State["STATE_PRESENTED_ALL"] = "STATE_PRESENTED_ALL";
    /**
     *  The frame was presented with some updates, but also missed some updates
     * (e.g. missed updates from the main-thread, but included updates from the
     * compositor thread). *
     */
    State["STATE_PRESENTED_PARTIAL"] = "STATE_PRESENTED_PARTIAL";
    /**
     * The frame was dropped, i.e. some updates were desired for the frame, but
     * was not presented. *
     */
    State["STATE_DROPPED"] = "STATE_DROPPED";
})(State || (State = {}));
var FrameDropReason;
(function (FrameDropReason) {
    FrameDropReason["REASON_UNSPECIFIED"] = "REASON_UNSPECIFIED";
    /**
     *  Frame was dropped by the display-compositor.
     * The display-compositor may drop a frame some times (e.g. the frame missed
     * the deadline, or was blocked on surface-sync, etc.) *
     */
    FrameDropReason["REASON_DISPLAY_COMPOSITOR"] = "REASON_DISPLAY_COMPOSITOR";
    /**
     *  Frame was dropped because of the main-thread.
     * The main-thread may cause a frame to be dropped, e.g. if the main-thread
     * is running expensive javascript, or doing a lot of layout updates, etc. *
     */
    FrameDropReason["REASON_MAIN_THREAD"] = "REASON_MAIN_THREAD";
    /**
     *  Frame was dropped by the client compositor.
     * The client compositor can drop some frames too (e.g. attempting to
     * recover latency, missing the deadline, etc.). *
     */
    FrameDropReason["REASON_CLIENT_COMPOSITOR"] = "REASON_CLIENT_COMPOSITOR";
})(FrameDropReason || (FrameDropReason = {}));
var ScrollState;
(function (ScrollState) {
    ScrollState["SCROLL_NONE"] = "SCROLL_NONE";
    ScrollState["SCROLL_MAIN_THREAD"] = "SCROLL_MAIN_THREAD";
    ScrollState["SCROLL_COMPOSITOR_THREAD"] = "SCROLL_COMPOSITOR_THREAD";
    /** Used when it can't be determined whether a scroll is in progress or not. */
    ScrollState["SCROLL_UNKNOWN"] = "SCROLL_UNKNOWN";
})(ScrollState || (ScrollState = {}));
var FrameType;
(function (FrameType) {
    FrameType["FORKED"] = "FORKED";
    FrameType["BACKFILL"] = "BACKFILL";
})(FrameType || (FrameType = {}));
export function isPipelineReporter(event) {
    return event.name === Name.PIPELINE_REPORTER;
}
export function isSyntheticBased(event) {
    return 'rawSourceEvent' in event;
}
export function isJSSample(event) {
    return event.name === Name.JS_SAMPLE;
}
function hasSyntheticPairEvents(event) {
    if (!event.args || !('data' in event.args) || typeof event.args.data !== 'object' || !event.args.data) {
        return false;
    }
    return 'beginEvent' in event.args.data && 'endEvent' in event.args.data;
}
export function isSyntheticInteraction(event) {
    return 'interactionId' in event && hasSyntheticPairEvents(event);
}
export function isDrawFrame(event) {
    // The extra check for INSTANT here is because in the past DrawFrame events had an ASYNC_NESTABLE_START and ASYNC_NESTABLE_END pair. We don't want to support those old events, so we have to check we are dealing with an instant event.
    return event.name === Name.DRAW_FRAME && event.ph === Phase.INSTANT;
}
export function isBeginFrame(event) {
    // Old traces did not have frameSeqId; but we do not want to support these.
    return Boolean(event.name === Name.BEGIN_FRAME && event.args && 'frameSeqId' in event.args);
}
export function isDroppedFrame(event) {
    // Old traces did not have frameSeqId; but we do not want to support these.
    return Boolean(event.name === Name.DROPPED_FRAME && event.args && 'frameSeqId' in event.args);
}
export function isRequestMainThreadFrame(event) {
    return event.name === Name.REQUEST_MAIN_THREAD_FRAME;
}
export function isBeginMainThreadFrame(event) {
    return event.name === Name.BEGIN_MAIN_THREAD_FRAME;
}
export function isNeedsBeginFrameChanged(event) {
    return event.name === Name.NEEDS_BEGIN_FRAME_CHANGED;
}
export function isCommit(event) {
    // Old traces did not have frameSeqId; but we do not want to support these.
    return Boolean(event.name === Name.COMMIT && event.args && 'frameSeqId' in event.args);
}
export function isRasterTask(event) {
    return event.name === Name.RASTER_TASK;
}
export function isCompositeLayers(event) {
    return event.name === Name.COMPOSITE_LAYERS;
}
export function isActivateLayerTree(event) {
    return event.name === Name.ACTIVATE_LAYER_TREE;
}
export function isInvalidationTracking(event) {
    return isScheduleStyleInvalidationTracking(event) || isStyleRecalcInvalidationTracking(event) ||
        isStyleInvalidatorInvalidationTracking(event) || isLayoutInvalidationTracking(event);
}
export function isDrawLazyPixelRef(event) {
    return event.name === Name.DRAW_LAZY_PIXEL_REF;
}
export function isDecodeLazyPixelRef(event) {
    return event.name === Name.DECODE_LAZY_PIXEL_REF;
}
export function isDecodeImage(event) {
    return event.name === Name.DECODE_IMAGE;
}
export var InvalidationEventType;
(function (InvalidationEventType) {
    InvalidationEventType["StyleInvalidatorInvalidationTracking"] = "StyleInvalidatorInvalidationTracking";
    InvalidationEventType["StyleRecalcInvalidationTracking"] = "StyleRecalcInvalidationTracking";
})(InvalidationEventType || (InvalidationEventType = {}));
export var SelectorTimingsKey;
(function (SelectorTimingsKey) {
    SelectorTimingsKey["Elapsed"] = "elapsed (us)";
    SelectorTimingsKey["RejectPercentage"] = "reject_percentage";
    SelectorTimingsKey["FastRejectCount"] = "fast_reject_count";
    SelectorTimingsKey["MatchAttempts"] = "match_attempts";
    SelectorTimingsKey["MatchCount"] = "match_count";
    SelectorTimingsKey["Selector"] = "selector";
    SelectorTimingsKey["StyleSheetId"] = "style_sheet_id";
    SelectorTimingsKey["InvalidationCount"] = "invalidation_count";
})(SelectorTimingsKey || (SelectorTimingsKey = {}));
export function isSelectorStats(event) {
    return event.name === Name.SELECTOR_STATS;
}
/** The real trace event is called 'UpdateLayoutTree' but we've aliased it for convenience. */
export function isRecalcStyle(event) {
    return event.name === Name.RECALC_STYLE;
}
export function isLayout(event) {
    return event.name === Name.LAYOUT && Boolean(event.args && 'beginData' in event.args);
}
export function isInvalidateLayout(event) {
    return event.name === Name.INVALIDATE_LAYOUT;
}
export function isDebuggerAsyncTaskScheduled(event) {
    return event.name === Name.DEBUGGER_ASYNC_TASK_SCHEDULED;
}
export function isDebuggerAsyncTaskRun(event) {
    return event.name === Name.DEBUGGER_ASYNC_TASK_RUN;
}
export function ProfileID(value) {
    return value;
}
export function CallFrameID(value) {
    return value;
}
export function SampleIndex(value) {
    return value;
}
export function ProcessID(value) {
    return value;
}
export function ThreadID(value) {
    return value;
}
export function WorkerId(value) {
    return value;
}
export function isComplete(event) {
    return event.ph === Phase.COMPLETE;
}
export function isBegin(event) {
    return event.ph === Phase.BEGIN;
}
export function isEnd(event) {
    return event.ph === Phase.END;
}
export function isDispatch(event) {
    return event.name === 'EventDispatch' && event.ph === Phase.COMPLETE;
}
export function isInstant(event) {
    return event.ph === Phase.INSTANT;
}
export function isRendererEvent(event) {
    return isInstant(event) || isComplete(event);
}
export function isFireIdleCallback(event) {
    return event.name === 'FireIdleCallback' && event.ph === Phase.COMPLETE;
}
export function isSchedulePostMessage(event) {
    return event.name === Name.SCHEDULE_POST_MESSAGE;
}
export function isHandlePostMessage(event) {
    return event.name === Name.HANDLE_POST_MESSAGE && event.ph === Phase.COMPLETE;
}
export function isUpdateCounters(event) {
    return event.name === 'UpdateCounters';
}
export function isDOMStats(event) {
    return event.name === 'DOMStats';
}
export function isThreadName(event) {
    return event.name === Name.THREAD_NAME;
}
export function isProcessName(event) {
    return event.name === 'process_name';
}
export function isTracingStartedInBrowser(event) {
    return event.name === Name.TRACING_STARTED_IN_BROWSER;
}
export function isFrameCommittedInBrowser(event) {
    return event.name === 'FrameCommittedInBrowser';
}
export function isCommitLoad(event) {
    return event.name === 'CommitLoad';
}
export function isAnimation(event) {
    // We've found some rare traces with an Animation trace event from a different category: https://crbug.com/1472375#comment7
    return event.name === 'Animation' && event.cat.includes('devtools.timeline');
}
export function isSyntheticAnimation(event) {
    if (event.name !== 'Animation' || !event.cat.includes('devtools.timeline')) {
        return false;
    }
    return hasSyntheticPairEvents(event);
}
export function isLayoutShift(event) {
    return event.name === Name.LAYOUT_SHIFT;
}
export function isLayoutInvalidationTracking(event) {
    return event.name === Name.LAYOUT_INVALIDATION_TRACKING;
}
export function isFirstContentfulPaint(event) {
    return event.name === Name.MARK_FCP;
}
export function isSoftFirstContentfulPaint(event) {
    return event.name === Name.MARK_SOFT_FCP;
}
export function isAnyFirstContentfulPaint(event) {
    return event.name === Name.MARK_FCP || event.name === Name.MARK_SOFT_FCP;
}
export function isLargestContentfulPaintCandidate(event) {
    return event.name === Name.MARK_LCP_CANDIDATE;
}
export function isAnyLargestContentfulPaintCandidate(event) {
    return event.name === Name.MARK_LCP_CANDIDATE || event.name === Name.MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION;
}
export function isSoftLargestContentfulPaintCandidate(event) {
    return event.name === Name.MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION;
}
export function isLargestImagePaintCandidate(event) {
    return event.name === 'LargestImagePaint::Candidate';
}
export function isLargestTextPaintCandidate(event) {
    return event.name === 'LargestTextPaint::Candidate';
}
export function isMarkLoad(event) {
    return event.name === Name.MARK_LOAD;
}
export function isFirstPaint(event) {
    return event.name === Name.MARK_FIRST_PAINT;
}
export function isMarkDOMContent(event) {
    return event.name === Name.MARK_DOM_CONTENT;
}
export function isInteractiveTime(event) {
    return event.name === 'InteractiveTime';
}
export function isEventTiming(event) {
    return event.name === Name.EVENT_TIMING;
}
export function isEventTimingEnd(event) {
    return isEventTiming(event) && event.ph === Phase.ASYNC_NESTABLE_END;
}
export function isEventTimingStart(event) {
    return isEventTiming(event) && event.ph === Phase.ASYNC_NESTABLE_START;
}
export function isGPUTask(event) {
    return event.name === 'GPUTask';
}
export function isProfile(event) {
    return event.name === Name.PROFILE;
}
export function isSyntheticCpuProfile(event) {
    return event.name === Name.CPU_PROFILE && event.ph === Phase.COMPLETE;
}
export function isProfileChunk(event) {
    return event.name === Name.PROFILE_CHUNK;
}
export function isResourceChangePriority(event) {
    return event.name === 'ResourceChangePriority';
}
export function isResourceSendRequest(event) {
    return event.name === 'ResourceSendRequest';
}
export function isResourceReceiveResponse(event) {
    return event.name === 'ResourceReceiveResponse';
}
export function isResourceMarkAsCached(event) {
    return event.name === 'ResourceMarkAsCached';
}
export function isResourceFinish(event) {
    return event.name === 'ResourceFinish';
}
export function isResourceWillSendRequest(event) {
    return event.name === 'ResourceWillSendRequest';
}
export function isResourceReceivedData(event) {
    return event.name === 'ResourceReceivedData';
}
/** Any event where we receive data (and get an encodedDataLength) **/
export function isReceivedDataEvent(event) {
    return event.name === 'ResourceReceivedData' || event.name === 'ResourceFinish' ||
        event.name === 'ResourceReceiveResponse';
}
export function isSyntheticNetworkRequest(event) {
    return event.name === Name.SYNTHETIC_NETWORK_REQUEST;
}
export function isSyntheticWebSocketConnection(event) {
    return event.name === 'SyntheticWebSocketConnection';
}
export function isNetworkTrackEntry(event) {
    return isSyntheticNetworkRequest(event) || isSyntheticWebSocketConnection(event) || isWebSocketTraceEvent(event);
}
export function isPrePaint(event) {
    return event.name === 'PrePaint';
}
/** A VALID navigation start (as it has a populated documentLoaderURL) */
export function isNavigationStart(event) {
    return event.name === Name.NAVIGATION_START && event.args?.data?.documentLoaderURL !== '';
}
export function isDidCommitSameDocumentNavigation(event) {
    return event.name === 'RenderFrameHostImpl::DidCommitSameDocumentNavigation' && event.ph === Phase.COMPLETE;
}
export function isMainFrameViewport(event) {
    return event.name === 'PaintTimingVisualizer::Viewport';
}
export function isSyntheticUserTiming(event) {
    if (event.cat !== 'blink.user_timing') {
        return false;
    }
    return hasSyntheticPairEvents(event);
}
export function isSyntheticConsoleTiming(event) {
    if (event.cat !== 'blink.console') {
        return false;
    }
    return hasSyntheticPairEvents(event);
}
export function isUserTiming(event) {
    return event.cat === 'blink.user_timing';
}
export function isDomLoading(event) {
    return event.name === Name.DOM_LOADING;
}
export function isBeginRemoteFontLoad(event) {
    return event.name === Name.BEGIN_REMOTE_FONT_LOAD;
}
export function isRemoteFontLoaded(event) {
    return event.name === Name.REMOTE_FONT_LOADED;
}
export function isPerformanceMeasure(event) {
    return isUserTiming(event) && isPhaseAsync(event.ph);
}
export function isPerformanceMeasureBegin(event) {
    return isPerformanceMeasure(event) && event.ph === Phase.ASYNC_NESTABLE_START;
}
export function isPerformanceMark(event) {
    return isUserTiming(event) && (event.ph === Phase.MARK || event.ph === Phase.INSTANT);
}
export function isConsoleTime(event) {
    return event.cat === 'blink.console' && isPhaseAsync(event.ph);
}
export function isConsoleTimeStamp(event) {
    return event.ph === Phase.INSTANT && event.name === Name.TIME_STAMP;
}
export function isUserTimingMeasure(event) {
    return event.name === Name.USER_TIMING_MEASURE;
}
export function isParseHTML(event) {
    return event.name === 'ParseHTML';
}
export function isSyntheticLayoutShift(event) {
    return event.name === Name.SYNTHETIC_LAYOUT_SHIFT;
}
export function isSyntheticLayoutShiftCluster(event) {
    return event.name === Name.SYNTHETIC_LAYOUT_SHIFT_CLUSTER;
}
export function isProfileCall(event) {
    return 'callFrame' in event;
}
export function isPaint(event) {
    return event.name === Name.PAINT;
}
export function isPaintImage(event) {
    return event.name === Name.PAINT_IMAGE && event.ph === Phase.COMPLETE;
}
export function isScrollLayer(event) {
    return event.name === Name.SCROLL_LAYER && event.ph === Phase.COMPLETE;
}
export function isSetLayerId(event) {
    return event.name === Name.SET_LAYER_TREE_ID;
}
export function isUpdateLayer(event) {
    return event.name === Name.UPDATE_LAYER;
}
export function isDisplayListItemListSnapshot(event) {
    return (event.name === Name.LEGACY_DISPLAY_ITEM_LIST_SNAPSHOT && event.ph === Phase.OBJECT_SNAPSHOT) ||
        (event.name === Name.DISPLAY_ITEM_LIST_SNAPSHOT && event.ph === Phase.INSTANT);
}
export function isLayerTreeHostImplSnapshot(event) {
    return event.name === Name.LAYER_TREE_HOST_IMPL_SNAPSHOT;
}
export function isFireAnimationFrame(event) {
    return event.name === Name.FIRE_ANIMATION_FRAME && event.ph === Phase.COMPLETE;
}
export function isTimerInstall(event) {
    return event.name === Name.TIMER_INSTALL;
}
export function isTimerFire(event) {
    return event.name === Name.TIMER_FIRE && event.ph === Phase.COMPLETE;
}
export function isRequestIdleCallback(event) {
    return event.name === Name.REQUEST_IDLE_CALLBACK;
}
export function isWebSocketCreate(event) {
    return event.name === Name.WEB_SOCKET_CREATE;
}
export function isWebSocketInfo(event) {
    return event.name === Name.WEB_SOCKET_SEND_HANDSHAKE_REQUEST ||
        event.name === Name.WEB_SOCKET_RECEIVE_HANDSHAKE_REQUEST || event.name === Name.WEB_SOCKET_DESTROY;
}
export function isWebSocketTransfer(event) {
    return event.name === Name.WEB_SOCKET_SEND || event.name === Name.WEB_SOCKET_RECEIVE;
}
export function isWebSocketSendHandshakeRequest(event) {
    return event.name === Name.WEB_SOCKET_SEND_HANDSHAKE_REQUEST;
}
export function isWebSocketReceiveHandshakeResponse(event) {
    return event.name === Name.WEB_SOCKET_RECEIVE_HANDSHAKE_REQUEST;
}
export function isWebSocketDestroy(event) {
    return event.name === Name.WEB_SOCKET_DESTROY;
}
export function isWebSocketTraceEvent(event) {
    return isWebSocketCreate(event) || isWebSocketInfo(event) || isWebSocketTransfer(event);
}
export function isWebSocketEvent(event) {
    return isWebSocketTraceEvent(event) || isSyntheticWebSocketConnection(event);
}
export function isV8Compile(event) {
    return event.name === Name.COMPILE && event.ph === Phase.COMPLETE;
}
export function isFunctionCall(event) {
    return event.name === Name.FUNCTION_CALL && event.ph === Phase.COMPLETE;
}
export function isSchedulePostTaskCallback(event) {
    return event.name === Name.SCHEDULE_POST_TASK_CALLBACK;
}
export function isRunPostTaskCallback(event) {
    return event.name === Name.RUN_POST_TASK_CALLBACK && event.ph === Phase.COMPLETE;
}
export function isAbortPostTaskCallback(event) {
    return event.name === Name.ABORT_POST_TASK_CALLBACK && event.ph === Phase.COMPLETE;
}
/**
 * Generally, before JS is executed, a trace event is dispatched that
 * parents the JS calls. These we call "invocation" events. This
 * function determines if an event is one of such. Note: these are also
 * commonly referred to as "JS entry points".
 */
export function isJSInvocationEvent(event) {
    switch (event.name) {
        case Name.RUN_MICROTASKS:
        case Name.FUNCTION_CALL:
        // TODO(paulirish): Define types for these Evaluate* events
        case Name.EVALUATE_SCRIPT:
        case Name.EVALUATE_MODULE:
        case Name.EVENT_DISPATCH:
        case Name.V8_EXECUTE:
        case Name.V8_CONSOLE_RUN_TASK:
            return true;
    }
    // Also consider any new v8 trace events. (eg 'V8.RunMicrotasks' and 'v8.run')
    if (event.name.startsWith('v8') || event.name.startsWith('V8')) {
        return true;
    }
    if (isConsoleRunTask(event)) {
        return true;
    }
    return false;
}
export function isConsoleRunTask(event) {
    return event.name === Name.V8_CONSOLE_RUN_TASK;
}
export function isFlowPhaseEvent(event) {
    return event.ph === Phase.FLOW_START || event.ph === Phase.FLOW_STEP || event.ph === Phase.FLOW_END;
}
export function isParseAuthorStyleSheetEvent(event) {
    return event.name === Name.PARSE_AUTHOR_STYLE_SHEET && event.ph === Phase.COMPLETE;
}
/**
 * This is an exhaustive list of events we track in the Performance
 * panel. Note not all of them are necessarliry shown in the flame
 * chart, some of them we only use for parsing.
 * TODO(crbug.com/1428024): Complete this enum.
 */
export var Name;
(function (Name) {
    /* Metadata */
    Name["THREAD_NAME"] = "thread_name";
    /* Task */
    Name["PROGRAM"] = "Program";
    Name["RUN_TASK"] = "RunTask";
    Name["ASYNC_TASK"] = "AsyncTask";
    Name["RUN_MICROTASKS"] = "RunMicrotasks";
    /* Load */
    Name["XHR_LOAD"] = "XHRLoad";
    Name["XHR_READY_STATE_CHANGED"] = "XHRReadyStateChange";
    /* Parse */
    Name["PARSE_HTML"] = "ParseHTML";
    Name["PARSE_CSS"] = "ParseAuthorStyleSheet";
    /* V8 */
    Name["COMPILE_CODE"] = "V8.CompileCode";
    Name["COMPILE_MODULE"] = "V8.CompileModule";
    // Although V8 emits the V8.CompileScript event, the event that actually
    // contains the useful information about the script (URL, etc), is contained
    // in the v8.compile event.
    // Yes, it is all lowercase compared to all the rest of the V8... events,
    // that is not a typo :)
    Name["COMPILE"] = "v8.compile";
    Name["COMPILE_SCRIPT"] = "V8.CompileScript";
    Name["OPTIMIZE"] = "V8.OptimizeCode";
    Name["WASM_STREAM_FROM_RESPONSE_CALLBACK"] = "v8.wasm.streamFromResponseCallback";
    Name["WASM_COMPILED_MODULE"] = "v8.wasm.compiledModule";
    Name["WASM_CACHED_MODULE"] = "v8.wasm.cachedModule";
    Name["WASM_MODULE_CACHE_HIT"] = "v8.wasm.moduleCacheHit";
    Name["WASM_MODULE_CACHE_INVALID"] = "v8.wasm.moduleCacheInvalid";
    /* Js */
    Name["PROFILE_CALL"] = "ProfileCall";
    Name["EVALUATE_SCRIPT"] = "EvaluateScript";
    Name["FUNCTION_CALL"] = "FunctionCall";
    Name["EVENT_DISPATCH"] = "EventDispatch";
    Name["EVALUATE_MODULE"] = "v8.evaluateModule";
    Name["REQUEST_MAIN_THREAD_FRAME"] = "RequestMainThreadFrame";
    Name["REQUEST_ANIMATION_FRAME"] = "RequestAnimationFrame";
    Name["CANCEL_ANIMATION_FRAME"] = "CancelAnimationFrame";
    Name["FIRE_ANIMATION_FRAME"] = "FireAnimationFrame";
    Name["REQUEST_IDLE_CALLBACK"] = "RequestIdleCallback";
    Name["CANCEL_IDLE_CALLBACK"] = "CancelIdleCallback";
    Name["FIRE_IDLE_CALLBACK"] = "FireIdleCallback";
    Name["TIMER_INSTALL"] = "TimerInstall";
    Name["TIMER_REMOVE"] = "TimerRemove";
    Name["TIMER_FIRE"] = "TimerFire";
    Name["WEB_SOCKET_CREATE"] = "WebSocketCreate";
    Name["WEB_SOCKET_SEND_HANDSHAKE"] = "WebSocketSendHandshakeRequest";
    Name["WEB_SOCKET_RECEIVE_HANDSHAKE"] = "WebSocketReceiveHandshakeResponse";
    Name["WEB_SOCKET_DESTROY"] = "WebSocketDestroy";
    Name["WEB_SOCKET_SEND"] = "WebSocketSend";
    Name["WEB_SOCKET_RECEIVE"] = "WebSocketReceive";
    Name["CRYPTO_DO_ENCRYPT"] = "DoEncrypt";
    Name["CRYPTO_DO_ENCRYPT_REPLY"] = "DoEncryptReply";
    Name["CRYPTO_DO_DECRYPT"] = "DoDecrypt";
    Name["CRYPTO_DO_DECRYPT_REPLY"] = "DoDecryptReply";
    Name["CRYPTO_DO_DIGEST"] = "DoDigest";
    Name["CRYPTO_DO_DIGEST_REPLY"] = "DoDigestReply";
    Name["CRYPTO_DO_SIGN"] = "DoSign";
    Name["CRYPTO_DO_SIGN_REPLY"] = "DoSignReply";
    Name["CRYPTO_DO_VERIFY"] = "DoVerify";
    Name["CRYPTO_DO_VERIFY_REPLY"] = "DoVerifyReply";
    Name["V8_EXECUTE"] = "V8.Execute";
    Name["V8_CONSOLE_RUN_TASK"] = "V8Console::runTask";
    Name["SCHEDULE_POST_TASK_CALLBACK"] = "SchedulePostTaskCallback";
    Name["RUN_POST_TASK_CALLBACK"] = "RunPostTaskCallback";
    Name["ABORT_POST_TASK_CALLBACK"] = "AbortPostTaskCallback";
    Name["DEBUGGER_ASYNC_TASK_RUN"] = "v8::Debugger::AsyncTaskRun";
    Name["DEBUGGER_ASYNC_TASK_SCHEDULED"] = "v8::Debugger::AsyncTaskScheduled";
    /* Gc */
    Name["GC"] = "GCEvent";
    Name["DOMGC"] = "BlinkGC.AtomicPhase";
    Name["MAJOR_GC"] = "MajorGC";
    Name["MINOR_GC"] = "MinorGC";
    Name["GC_COLLECT_GARBARGE"] = "BlinkGC.AtomicPhase";
    Name["CPPGC_SWEEP"] = "CppGC.IncrementalSweep";
    /* Layout */
    Name["SCHEDULE_STYLE_RECALCULATION"] = "ScheduleStyleRecalculation";
    Name["LAYOUT"] = "Layout";
    /** The real trace event is called 'UpdateLayoutTree' but we've aliased it for convenience. */
    Name["RECALC_STYLE"] = "UpdateLayoutTree";
    Name["INVALIDATE_LAYOUT"] = "InvalidateLayout";
    Name["LAYOUT_INVALIDATION_TRACKING"] = "LayoutInvalidationTracking";
    Name["COMPUTE_INTERSECTION"] = "ComputeIntersections";
    Name["HIT_TEST"] = "HitTest";
    Name["PRE_PAINT"] = "PrePaint";
    Name["LAYERIZE"] = "Layerize";
    Name["LAYOUT_SHIFT"] = "LayoutShift";
    Name["SYNTHETIC_LAYOUT_SHIFT"] = "SyntheticLayoutShift";
    Name["SYNTHETIC_LAYOUT_SHIFT_CLUSTER"] = "SyntheticLayoutShiftCluster";
    Name["UPDATE_LAYER_TREE"] = "UpdateLayerTree";
    Name["SCHEDULE_STYLE_INVALIDATION_TRACKING"] = "ScheduleStyleInvalidationTracking";
    Name["STYLE_RECALC_INVALIDATION_TRACKING"] = "StyleRecalcInvalidationTracking";
    Name["STYLE_INVALIDATOR_INVALIDATION_TRACKING"] = "StyleInvalidatorInvalidationTracking";
    Name["SELECTOR_STATS"] = "SelectorStats";
    Name["BEGIN_COMMIT_COMPOSITOR_FRAME"] = "BeginCommitCompositorFrame";
    Name["PARSE_META_VIEWPORT"] = "ParseMetaViewport";
    Name["META_CHARSET_CHECK"] = "MetaCharsetCheck";
    /* Paint */
    Name["SCROLL_LAYER"] = "ScrollLayer";
    Name["UPDATE_LAYER"] = "UpdateLayer";
    Name["PAINT_SETUP"] = "PaintSetup";
    Name["PAINT"] = "Paint";
    Name["PAINT_IMAGE"] = "PaintImage";
    Name["COMMIT"] = "Commit";
    Name["COMPOSITE_LAYERS"] = "CompositeLayers";
    Name["RASTER_TASK"] = "RasterTask";
    Name["IMAGE_DECODE_TASK"] = "ImageDecodeTask";
    Name["IMAGE_UPLOAD_TASK"] = "ImageUploadTask";
    Name["DECODE_IMAGE"] = "Decode Image";
    Name["DRAW_LAZY_PIXEL_REF"] = "Draw LazyPixelRef";
    Name["DECODE_LAZY_PIXEL_REF"] = "Decode LazyPixelRef";
    Name["GPU_TASK"] = "GPUTask";
    Name["RASTERIZE"] = "Rasterize";
    Name["EVENT_TIMING"] = "EventTiming";
    /* Compile */
    Name["OPTIMIZE_CODE"] = "V8.OptimizeCode";
    Name["CACHE_SCRIPT"] = "v8.produceCache";
    Name["CACHE_MODULE"] = "v8.produceModuleCache";
    // V8Sample events are coming from tracing and contain raw stacks with function addresses.
    // After being processed with help of JitCodeAdded and JitCodeMoved events they
    // get translated into function infos and stored as stacks in JSSample events.
    Name["V8_SAMPLE"] = "V8Sample";
    Name["JIT_CODE_ADDED"] = "JitCodeAdded";
    Name["JIT_CODE_MOVED"] = "JitCodeMoved";
    Name["STREAMING_COMPILE_SCRIPT"] = "v8.parseOnBackground";
    Name["STREAMING_COMPILE_SCRIPT_WAITING"] = "v8.parseOnBackgroundWaiting";
    Name["STREAMING_COMPILE_SCRIPT_PARSING"] = "v8.parseOnBackgroundParsing";
    Name["BACKGROUND_DESERIALIZE"] = "v8.deserializeOnBackground";
    Name["FINALIZE_DESERIALIZATION"] = "V8.FinalizeDeserialization";
    /* Markers */
    Name["COMMIT_LOAD"] = "CommitLoad";
    Name["MARK_LOAD"] = "MarkLoad";
    Name["MARK_DOM_CONTENT"] = "MarkDOMContent";
    Name["MARK_FIRST_PAINT"] = "firstPaint";
    Name["MARK_FCP"] = "firstContentfulPaint";
    Name["MARK_SOFT_FCP"] = "SyntheticSoftFirstContentfulPaint";
    Name["MARK_LCP_CANDIDATE"] = "largestContentfulPaint::Candidate";
    Name["MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION"] = "largestContentfulPaint::CandidateForSoftNavigation";
    Name["MARK_LCP_INVALIDATE"] = "largestContentfulPaint::Invalidate";
    Name["NAVIGATION_START"] = "navigationStart";
    Name["SOFT_NAVIGATION_START"] = "SoftNavigationStart";
    Name["CONSOLE_TIME"] = "ConsoleTime";
    Name["USER_TIMING"] = "UserTiming";
    Name["INTERACTIVE_TIME"] = "InteractiveTime";
    Name["TIME_STAMP"] = "TimeStamp";
    /* Frames */
    Name["BEGIN_FRAME"] = "BeginFrame";
    Name["NEEDS_BEGIN_FRAME_CHANGED"] = "NeedsBeginFrameChanged";
    Name["BEGIN_MAIN_THREAD_FRAME"] = "BeginMainThreadFrame";
    Name["ACTIVATE_LAYER_TREE"] = "ActivateLayerTree";
    Name["DRAW_FRAME"] = "DrawFrame";
    Name["DROPPED_FRAME"] = "DroppedFrame";
    Name["FRAME_STARTED_LOADING"] = "FrameStartedLoading";
    Name["PIPELINE_REPORTER"] = "PipelineReporter";
    Name["SCREENSHOT"] = "Screenshot";
    /* Network request events */
    Name["RESOURCE_WILL_SEND_REQUEST"] = "ResourceWillSendRequest";
    Name["RESOURCE_SEND_REQUEST"] = "ResourceSendRequest";
    Name["RESOURCE_RECEIVE_RESPONSE"] = "ResourceReceiveResponse";
    Name["RESOURCE_RECEIVE_DATA"] = "ResourceReceivedData";
    Name["RESOURCE_FINISH"] = "ResourceFinish";
    Name["RESOURCE_MARK_AS_CACHED"] = "ResourceMarkAsCached";
    /* Web sockets */
    Name["WEB_SOCKET_SEND_HANDSHAKE_REQUEST"] = "WebSocketSendHandshakeRequest";
    Name["WEB_SOCKET_RECEIVE_HANDSHAKE_REQUEST"] = "WebSocketReceiveHandshakeResponse";
    /* CPU Profiling */
    Name["CPU_PROFILE"] = "CpuProfile";
    Name["PROFILE"] = "Profile";
    Name["START_PROFILING"] = "CpuProfiler::StartProfiling";
    Name["PROFILE_CHUNK"] = "ProfileChunk";
    Name["UPDATE_COUNTERS"] = "UpdateCounters";
    Name["JS_SAMPLE"] = "JSSample";
    /* Other */
    Name["ANIMATION"] = "Animation";
    Name["PARSE_AUTHOR_STYLE_SHEET"] = "ParseAuthorStyleSheet";
    Name["EMBEDDER_CALLBACK"] = "EmbedderCallback";
    Name["SET_LAYER_TREE_ID"] = "SetLayerTreeId";
    Name["TRACING_STARTED_IN_PAGE"] = "TracingStartedInPage";
    Name["TRACING_STARTED_IN_BROWSER"] = "TracingStartedInBrowser";
    Name["TRACING_SESSION_ID_FOR_WORKER"] = "TracingSessionIdForWorker";
    Name["LAZY_PIXEL_REF"] = "LazyPixelRef";
    Name["LAYER_TREE_HOST_IMPL_SNAPSHOT"] = "cc::LayerTreeHostImpl";
    Name["PICTURE_SNAPSHOT"] = "cc::Picture";
    Name["LEGACY_DISPLAY_ITEM_LIST_SNAPSHOT"] = "cc::DisplayItemList";
    Name["DISPLAY_ITEM_LIST_SNAPSHOT"] = "cc::DisplayItemList:snapshot";
    Name["INPUT_LATENCY_MOUSE_MOVE"] = "InputLatency::MouseMove";
    Name["INPUT_LATENCY_MOUSE_WHEEL"] = "InputLatency::MouseWheel";
    Name["IMPL_SIDE_FLING"] = "InputHandlerProxy::HandleGestureFling::started";
    Name["SCHEDULE_POST_MESSAGE"] = "SchedulePostMessage";
    Name["HANDLE_POST_MESSAGE"] = "HandlePostMessage";
    Name["RENDER_FRAME_IMPL_CREATE_CHILD_FRAME"] = "RenderFrameImpl::createChildFrame";
    Name["LAYOUT_IMAGE_UNSIZED"] = "LayoutImageUnsized";
    Name["DOM_LOADING"] = "domLoading";
    Name["BEGIN_REMOTE_FONT_LOAD"] = "BeginRemoteFontLoad";
    Name["REMOTE_FONT_LOADED"] = "RemoteFontLoaded";
    Name["ANIMATION_FRAME"] = "AnimationFrame";
    Name["ANIMATION_FRAME_PRESENTATION"] = "AnimationFrame::Presentation";
    Name["SYNTHETIC_NETWORK_REQUEST"] = "SyntheticNetworkRequest";
    Name["USER_TIMING_MEASURE"] = "UserTiming::Measure";
    Name["LINK_PRECONNECT"] = "LinkPreconnect";
    Name["PRELOAD_RENDER_BLOCKING_STATUS_CHANGE"] = "PreloadRenderBlockingStatusChange";
})(Name || (Name = {}));
export const MarkerName = [
    Name.MARK_DOM_CONTENT,
    Name.MARK_LOAD,
    Name.MARK_FIRST_PAINT,
    Name.MARK_FCP,
    Name.MARK_SOFT_FCP,
    Name.MARK_LCP_CANDIDATE,
    Name.MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION,
    Name.NAVIGATION_START,
    Name.SOFT_NAVIGATION_START,
];
/**
 * NOT AN EXHAUSTIVE LIST: just some categories we use and refer
 * to in multiple places.
 **/
export const Categories = {
    Console: 'blink.console',
    UserTiming: 'blink.user_timing',
    Loading: 'loading',
};
export const DefaultCategories = [
    'blink.console',
    'blink.user_timing',
    'loading',
    'devtools.timeline',
    'disabled-by-default-devtools.target-rundown',
    'disabled-by-default-devtools.timeline.frame',
    'disabled-by-default-devtools.timeline.stack',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.v8-source-rundown-sources',
    'disabled-by-default-devtools.v8-source-rundown',
    'disabled-by-default-layout_shift.debug',
    'disabled-by-default-v8.inspector',
    'disabled-by-default-v8.cpu_profiler.hires',
    'disabled-by-default-lighthouse',
    'v8.execute',
    'v8',
    'cppgc',
    'navigation,rail',
];
export const OptionalCategories = {
    JsSampling: ['disabled-by-default-v8.cpu_profiler'],
    InvalidationTracking: ['disabled-by-default-devtools.timeline.invalidationTracking'],
    AdvancedPaint: [
        'disabled-by-default-devtools.timeline.layers',
        'disabled-by-default-devtools.timeline.picture',
        'disabled-by-default-blink.graphics_context_annotations',
    ],
    Screenshot: ['disabled-by-default-devtools.screenshot'],
    CssSelectorStats: [
        'disabled-by-default-blink.debug',
        'disabled-by-default-devtools.timeline.invalidationTracking',
    ],
};
export function isLegacyTimelineFrame(data) {
    return 'idle' in data && typeof data.idle === 'boolean';
}
export function isRundownScriptCompiled(event) {
    return event.cat === 'disabled-by-default-devtools.target-rundown';
}
export function isRundownScript(event) {
    return event.cat === 'disabled-by-default-devtools.v8-source-rundown' && event.name === 'ScriptCatchup';
}
export function isRundownScriptSource(event) {
    return event.cat === 'disabled-by-default-devtools.v8-source-rundown-sources' && event.name === 'ScriptCatchup';
}
export function isRundownScriptSourceLarge(event) {
    return event.cat === 'disabled-by-default-devtools.v8-source-rundown-sources' && event.name === 'LargeScriptCatchup';
}
export function isAnyScriptSourceEvent(event) {
    return event.cat === 'disabled-by-default-devtools.v8-source-rundown-sources';
}
export function isPreloadRenderBlockingStatusChangeEvent(event) {
    return event.name === Name.PRELOAD_RENDER_BLOCKING_STATUS_CHANGE;
}
//# sourceMappingURL=TraceEvents.js.map