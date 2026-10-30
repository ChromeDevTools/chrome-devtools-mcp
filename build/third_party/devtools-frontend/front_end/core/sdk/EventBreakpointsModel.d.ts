import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import { CategorizedBreakpoint, Category } from './CategorizedBreakpoint.js';
import type { EventListenerPausedDetailsAuxData } from './DebuggerModel.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
import { type SDKModelObserver, TargetManager } from './TargetManager.js';
export declare const enum InstrumentationNames {
    BEFORE_BIDDER_WORKLET_BIDDING_START = "beforeBidderWorkletBiddingStart",
    BEFORE_BIDDER_WORKLET_REPORTING_START = "beforeBidderWorkletReportingStart",
    BEFORE_SELLER_WORKLET_SCORING_START = "beforeSellerWorkletScoringStart",
    BEFORE_SELLER_WORKLET_REPORTING_START = "beforeSellerWorkletReportingStart",
    SET_TIMEOUT = "setTimeout",
    CLEAR_TIMEOUT = "clearTimeout",
    SET_TIMEOUT_CALLBACK = "setTimeout.callback",
    SET_INTERVAL = "setInterval",
    CLEAR_INTERVAL = "clearInterval",
    SET_INTERVAL_CALLBACK = "setInterval.callback",
    SCRIPT_FIRST_STATEMENT = "scriptFirstStatement",
    SCRIPT_BLOCKED_BY_CSP = "scriptBlockedByCSP",
    REQUEST_ANIMATION_FRAME = "requestAnimationFrame",
    CANCEL_ANIMATION_FRAME = "cancelAnimationFrame",
    REQUEST_ANIMATION_FRAME_CALLBACK = "requestAnimationFrame.callback",
    WEBGL_ERROR_FIRED = "webglErrorFired",
    WEBGL_WARNING_FIRED = "webglWarningFired",
    ELEMENT_SET_INNER_HTML = "Element.setInnerHTML",
    CANVAS_CONTEXT_CREATED = "canvasContextCreated",
    GEOLOCATION_GET_CURRENT_POSITION = "Geolocation.getCurrentPosition",
    GEOLOCATION_WATCH_POSITION = "Geolocation.watchPosition",
    NOTIFICATION_REQUEST_PERMISSION = "Notification.requestPermission",
    DOM_WINDOW_CLOSE = "DOMWindow.close",
    DOCUMENT_WRITE = "Document.write",
    AUDIO_CONTEXT_CREATED = "audioContextCreated",
    AUDIO_CONTEXT_CLOSED = "audioContextClosed",
    AUDIO_CONTEXT_RESUMED = "audioContextResumed",
    AUDIO_CONTEXT_SUSPENDED = "audioContextSuspended"
}
export declare class EventBreakpointsModel extends SDKModel<void> {
    readonly agent: ProtocolProxyApi.EventBreakpointsApi;
    constructor(target: Target);
}
/**
 * This implementation (as opposed to similar class in DOMDebuggerModel) is for
 * instrumentation breakpoints in targets that run JS but do not have a DOM.
 **/
declare class EventListenerBreakpoint extends CategorizedBreakpoint {
    #private;
    constructor(category: Category, name: string, targetManager: TargetManager);
    setEnabled(enabled: boolean): void;
    updateOnModel(model: EventBreakpointsModel): void;
    static readonly instrumentationPrefix = "instrumentation:";
}
export declare class EventBreakpointsManager implements SDKModelObserver<EventBreakpointsModel> {
    #private;
    constructor(targetManager?: TargetManager);
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager?: TargetManager;
    }): EventBreakpointsManager;
    static removeInstance(): void;
    private createInstrumentationBreakpoints;
    eventListenerBreakpoints(): EventListenerBreakpoint[];
    resolveEventListenerBreakpoint({ eventName }: EventListenerPausedDetailsAuxData): EventListenerBreakpoint | null;
    modelAdded(eventBreakpointModel: EventBreakpointsModel): void;
    modelRemoved(_eventBreakpointModel: EventBreakpointsModel): void;
}
export {};
