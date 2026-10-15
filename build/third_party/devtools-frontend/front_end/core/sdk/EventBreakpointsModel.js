// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../../core/root/root.js';
import { CategorizedBreakpoint } from './CategorizedBreakpoint.js';
import { SDKModel } from './SDKModel.js';
import { TargetManager } from './TargetManager.js';
export class EventBreakpointsModel extends SDKModel {
    agent;
    constructor(target) {
        super(target);
        this.agent = target.eventBreakpointsAgent();
    }
}
/**
 * This implementation (as opposed to similar class in DOMDebuggerModel) is for
 * instrumentation breakpoints in targets that run JS but do not have a DOM.
 **/
class EventListenerBreakpoint extends CategorizedBreakpoint {
    #targetManager;
    constructor(category, name, targetManager) {
        super(category, name);
        this.#targetManager = targetManager;
    }
    setEnabled(enabled) {
        if (this.enabled() === enabled) {
            return;
        }
        super.setEnabled(enabled);
        for (const model of this.#targetManager.models(EventBreakpointsModel)) {
            this.updateOnModel(model);
        }
    }
    updateOnModel(model) {
        if (this.enabled()) {
            void model.agent.invoke_setInstrumentationBreakpoint({ eventName: this.name });
        }
        else {
            void model.agent.invoke_removeInstrumentationBreakpoint({ eventName: this.name });
        }
    }
    static instrumentationPrefix = 'instrumentation:';
}
export class EventBreakpointsManager {
    #eventListenerBreakpoints = [];
    #targetManager;
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    constructor(targetManager = TargetManager.instance()) {
        this.#targetManager = targetManager;
        this.createInstrumentationBreakpoints("auction-worklet" /* Category.AUCTION_WORKLET */, [
            "beforeBidderWorkletBiddingStart" /* InstrumentationNames.BEFORE_BIDDER_WORKLET_BIDDING_START */,
            "beforeBidderWorkletReportingStart" /* InstrumentationNames.BEFORE_BIDDER_WORKLET_REPORTING_START */,
            "beforeSellerWorkletScoringStart" /* InstrumentationNames.BEFORE_SELLER_WORKLET_SCORING_START */,
            "beforeSellerWorkletReportingStart" /* InstrumentationNames.BEFORE_SELLER_WORKLET_REPORTING_START */,
        ]);
        this.createInstrumentationBreakpoints("animation" /* Category.ANIMATION */, [
            "requestAnimationFrame" /* InstrumentationNames.REQUEST_ANIMATION_FRAME */,
            "cancelAnimationFrame" /* InstrumentationNames.CANCEL_ANIMATION_FRAME */,
            "requestAnimationFrame.callback" /* InstrumentationNames.REQUEST_ANIMATION_FRAME_CALLBACK */,
        ]);
        this.createInstrumentationBreakpoints("canvas" /* Category.CANVAS */, [
            "canvasContextCreated" /* InstrumentationNames.CANVAS_CONTEXT_CREATED */,
            "webglErrorFired" /* InstrumentationNames.WEBGL_ERROR_FIRED */,
            "webglWarningFired" /* InstrumentationNames.WEBGL_WARNING_FIRED */,
        ]);
        this.createInstrumentationBreakpoints("geolocation" /* Category.GEOLOCATION */, [
            "Geolocation.getCurrentPosition" /* InstrumentationNames.GEOLOCATION_GET_CURRENT_POSITION */,
            "Geolocation.watchPosition" /* InstrumentationNames.GEOLOCATION_WATCH_POSITION */,
        ]);
        this.createInstrumentationBreakpoints("notification" /* Category.NOTIFICATION */, [
            "Notification.requestPermission" /* InstrumentationNames.NOTIFICATION_REQUEST_PERMISSION */,
        ]);
        this.createInstrumentationBreakpoints("parse" /* Category.PARSE */, [
            "Element.setInnerHTML" /* InstrumentationNames.ELEMENT_SET_INNER_HTML */,
            "Document.write" /* InstrumentationNames.DOCUMENT_WRITE */,
        ]);
        this.createInstrumentationBreakpoints("script" /* Category.SCRIPT */, [
            "scriptFirstStatement" /* InstrumentationNames.SCRIPT_FIRST_STATEMENT */,
            "scriptBlockedByCSP" /* InstrumentationNames.SCRIPT_BLOCKED_BY_CSP */,
        ]);
        this.createInstrumentationBreakpoints("timer" /* Category.TIMER */, [
            "setTimeout" /* InstrumentationNames.SET_TIMEOUT */,
            "clearTimeout" /* InstrumentationNames.CLEAR_TIMEOUT */,
            "setTimeout.callback" /* InstrumentationNames.SET_TIMEOUT_CALLBACK */,
            "setInterval" /* InstrumentationNames.SET_INTERVAL */,
            "clearInterval" /* InstrumentationNames.CLEAR_INTERVAL */,
            "setInterval.callback" /* InstrumentationNames.SET_INTERVAL_CALLBACK */,
        ]);
        this.createInstrumentationBreakpoints("window" /* Category.WINDOW */, [
            "DOMWindow.close" /* InstrumentationNames.DOM_WINDOW_CLOSE */,
        ]);
        this.createInstrumentationBreakpoints("web-audio" /* Category.WEB_AUDIO */, [
            "audioContextCreated" /* InstrumentationNames.AUDIO_CONTEXT_CREATED */,
            "audioContextClosed" /* InstrumentationNames.AUDIO_CONTEXT_CLOSED */,
            "audioContextResumed" /* InstrumentationNames.AUDIO_CONTEXT_RESUMED */,
            "audioContextSuspended" /* InstrumentationNames.AUDIO_CONTEXT_SUSPENDED */,
        ]);
        this.#targetManager.observeModels(EventBreakpointsModel, this);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew, targetManager } = opts;
        if (!Root.DevToolsContext.globalInstance().has(EventBreakpointsManager) || forceNew) {
            Root.DevToolsContext.globalInstance().set(EventBreakpointsManager, 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            new EventBreakpointsManager(targetManager ?? TargetManager.instance()));
        }
        return Root.DevToolsContext.globalInstance().get(EventBreakpointsManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(EventBreakpointsManager);
    }
    createInstrumentationBreakpoints(category, instrumentationNames) {
        for (const instrumentationName of instrumentationNames) {
            this.#eventListenerBreakpoints.push(new EventListenerBreakpoint(category, instrumentationName, this.#targetManager));
        }
    }
    eventListenerBreakpoints() {
        return this.#eventListenerBreakpoints.slice();
    }
    resolveEventListenerBreakpoint({ eventName }) {
        if (!eventName.startsWith(EventListenerBreakpoint.instrumentationPrefix)) {
            return null;
        }
        const instrumentationName = eventName.substring(EventListenerBreakpoint.instrumentationPrefix.length);
        return this.#eventListenerBreakpoints.find(b => b.name === instrumentationName) || null;
    }
    modelAdded(eventBreakpointModel) {
        for (const breakpoint of this.#eventListenerBreakpoints) {
            if (breakpoint.enabled()) {
                breakpoint.updateOnModel(eventBreakpointModel);
            }
        }
    }
    modelRemoved(_eventBreakpointModel) {
    }
}
SDKModel.register(EventBreakpointsModel, { capabilities: 524288 /* Capability.EVENT_BREAKPOINTS */, autostart: false });
//# sourceMappingURL=EventBreakpointsModel.js.map