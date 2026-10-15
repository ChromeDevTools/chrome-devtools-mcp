// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { CategorizedBreakpoint } from './CategorizedBreakpoint.js';
import { DOMModel, Events as DOMModelEvents } from './DOMModel.js';
import { RemoteObject } from './RemoteObject.js';
import { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { TargetManager } from './TargetManager.js';
export class DOMDebuggerModel extends SDKModel {
    agent;
    #runtimeModel;
    #domModel;
    #domBreakpoints;
    #domBreakpointsSetting;
    suspended = false;
    constructor(target) {
        super(target);
        this.agent = target.domdebuggerAgent();
        this.#runtimeModel = target.model(RuntimeModel);
        this.#domModel = target.model(DOMModel);
        this.#domModel.addEventListener(DOMModelEvents.DocumentUpdated, this.documentUpdated, this);
        this.#domModel.addEventListener(DOMModelEvents.NodeRemoved, this.nodeRemoved, this);
        this.#domBreakpoints = [];
        this.#domBreakpointsSetting = this.target().targetManager().settings.createLocalSetting('dom-breakpoints', []);
        if (this.#domModel.existingDocument()) {
            void this.documentUpdated();
        }
    }
    runtimeModel() {
        return this.#runtimeModel;
    }
    async suspendModel() {
        this.suspended = true;
    }
    async resumeModel() {
        this.suspended = false;
    }
    async eventListeners(remoteObject) {
        console.assert(remoteObject.runtimeModel() === this.#runtimeModel);
        if (!remoteObject.objectId) {
            return [];
        }
        const listeners = await this.agent.invoke_getEventListeners({ objectId: remoteObject.objectId });
        const eventListeners = [];
        for (const payload of listeners.listeners || []) {
            const location = this.#runtimeModel.debuggerModel().createRawLocationByScriptId(payload.scriptId, payload.lineNumber, payload.columnNumber);
            if (!location) {
                continue;
            }
            eventListeners.push(new EventListener(this, remoteObject, payload.type, payload.useCapture, payload.passive, payload.once, payload.handler ? this.#runtimeModel.createRemoteObject(payload.handler) : null, payload.originalHandler ? this.#runtimeModel.createRemoteObject(payload.originalHandler) : null, location, null));
        }
        return eventListeners;
    }
    retrieveDOMBreakpoints() {
        void this.#domModel.requestDocument();
    }
    domBreakpoints() {
        return this.#domBreakpoints.slice();
    }
    hasDOMBreakpoint(node, type) {
        return this.#domBreakpoints.some(breakpoint => (breakpoint.node === node && breakpoint.type === type));
    }
    setDOMBreakpoint(node, type) {
        for (const breakpoint of this.#domBreakpoints) {
            if (breakpoint.node === node && breakpoint.type === type) {
                this.toggleDOMBreakpoint(breakpoint, true);
                return breakpoint;
            }
        }
        const breakpoint = new DOMBreakpoint(this, node, type, true);
        this.#domBreakpoints.push(breakpoint);
        this.enableDOMBreakpoint(breakpoint);
        this.saveDOMBreakpoints();
        this.dispatchEventToListeners("DOMBreakpointAdded" /* Events.DOM_BREAKPOINT_ADDED */, breakpoint);
        return breakpoint;
    }
    removeDOMBreakpoint(node, type) {
        this.removeDOMBreakpoints(breakpoint => breakpoint.node === node && breakpoint.type === type);
    }
    removeAllDOMBreakpoints() {
        this.removeDOMBreakpoints(_breakpoint => true);
    }
    toggleDOMBreakpoint(breakpoint, enabled) {
        if (enabled === breakpoint.enabled) {
            return;
        }
        breakpoint.enabled = enabled;
        if (enabled) {
            this.enableDOMBreakpoint(breakpoint);
        }
        else {
            this.disableDOMBreakpoint(breakpoint);
        }
        this.saveDOMBreakpoints();
        this.dispatchEventToListeners("DOMBreakpointToggled" /* Events.DOM_BREAKPOINT_TOGGLED */, breakpoint);
    }
    enableDOMBreakpoint(breakpoint) {
        if (breakpoint.node.id) {
            void this.agent.invoke_setDOMBreakpoint({ nodeId: breakpoint.node.id, type: breakpoint.type });
            breakpoint.node.setMarker(Marker, true);
        }
    }
    disableDOMBreakpoint(breakpoint) {
        if (breakpoint.node.id) {
            void this.agent.invoke_removeDOMBreakpoint({ nodeId: breakpoint.node.id, type: breakpoint.type });
            breakpoint.node.setMarker(Marker, this.nodeHasBreakpoints(breakpoint.node) ? true : null);
        }
    }
    nodeHasBreakpoints(node) {
        for (const breakpoint of this.#domBreakpoints) {
            if (breakpoint.node === node && breakpoint.enabled) {
                return true;
            }
        }
        return false;
    }
    resolveDOMBreakpointData(auxData) {
        const type = auxData['type'];
        const node = this.#domModel.nodeForId(auxData['nodeId']);
        if (!type || !node) {
            return null;
        }
        let targetNode = null;
        let insertion = false;
        if (type === "subtree-modified" /* Protocol.DOMDebugger.DOMBreakpointType.SubtreeModified */) {
            insertion = auxData['insertion'] || false;
            targetNode = this.#domModel.nodeForId(auxData['targetNodeId']);
        }
        return { type, node, targetNode, insertion };
    }
    currentURL() {
        const domDocument = this.#domModel.existingDocument();
        return domDocument ? domDocument.documentURL : Platform.DevToolsPath.EmptyUrlString;
    }
    async documentUpdated() {
        if (this.suspended) {
            return;
        }
        const removed = this.#domBreakpoints;
        this.#domBreakpoints = [];
        this.dispatchEventToListeners("DOMBreakpointsRemoved" /* Events.DOM_BREAKPOINTS_REMOVED */, removed);
        // this.currentURL() is empty when the page is reloaded because the
        // new document has not been requested yet and the old one has been
        // removed. Therefore, we need to request the document and wait for it.
        // Note that requestDocument() caches the document so that it is requested
        // only once.
        const document = await this.#domModel.requestDocument();
        const currentURL = document ? document.documentURL : Platform.DevToolsPath.EmptyUrlString;
        for (const breakpoint of this.#domBreakpointsSetting.get()) {
            if (breakpoint.url === currentURL) {
                void this.#domModel.pushNodeByPathToFrontend(breakpoint.path).then(appendBreakpoint.bind(this, breakpoint));
            }
        }
        function appendBreakpoint(breakpoint, nodeId) {
            const node = nodeId ? this.#domModel.nodeForId(nodeId) : null;
            if (!node) {
                return;
            }
            // Before creating a new DOMBreakpoint, we need to ensure there's no
            // existing breakpoint with the same node and breakpoint type, else we would create
            // multiple DOMBreakpoints of the same type and for the same node.
            for (const existingBreakpoint of this.#domBreakpoints) {
                if (existingBreakpoint.node === node && existingBreakpoint.type === breakpoint.type) {
                    return;
                }
            }
            const domBreakpoint = new DOMBreakpoint(this, node, breakpoint.type, breakpoint.enabled);
            this.#domBreakpoints.push(domBreakpoint);
            if (breakpoint.enabled) {
                this.enableDOMBreakpoint(domBreakpoint);
            }
            this.dispatchEventToListeners("DOMBreakpointAdded" /* Events.DOM_BREAKPOINT_ADDED */, domBreakpoint);
        }
    }
    removeDOMBreakpoints(filter) {
        const removed = [];
        const left = [];
        for (const breakpoint of this.#domBreakpoints) {
            if (filter(breakpoint)) {
                removed.push(breakpoint);
                if (breakpoint.enabled) {
                    breakpoint.enabled = false;
                    this.disableDOMBreakpoint(breakpoint);
                }
            }
            else {
                left.push(breakpoint);
            }
        }
        if (!removed.length) {
            return;
        }
        this.#domBreakpoints = left;
        this.saveDOMBreakpoints();
        this.dispatchEventToListeners("DOMBreakpointsRemoved" /* Events.DOM_BREAKPOINTS_REMOVED */, removed);
    }
    nodeRemoved(event) {
        if (this.suspended) {
            return;
        }
        const { node } = event.data;
        const children = node.children() || [];
        this.removeDOMBreakpoints(breakpoint => breakpoint.node === node || children.indexOf(breakpoint.node) !== -1);
    }
    saveDOMBreakpoints() {
        const currentURL = this.currentURL();
        const breakpoints = this.#domBreakpointsSetting.get().filter((breakpoint) => breakpoint.url !== currentURL);
        for (const breakpoint of this.#domBreakpoints) {
            breakpoints.push({ url: currentURL, path: breakpoint.node.path(), type: breakpoint.type, enabled: breakpoint.enabled });
        }
        this.#domBreakpointsSetting.set(breakpoints);
    }
}
const Marker = 'breakpoint-marker';
export class DOMBreakpoint {
    domDebuggerModel;
    node;
    type;
    enabled;
    constructor(domDebuggerModel, node, type, enabled) {
        this.domDebuggerModel = domDebuggerModel;
        this.node = node;
        this.type = type;
        this.enabled = enabled;
    }
}
export class EventListener {
    #domDebuggerModel;
    #eventTarget;
    #type;
    #useCapture;
    #passive;
    #once;
    #handler;
    #originalHandler;
    #location;
    #sourceURL;
    #customRemoveFunction;
    #origin;
    constructor(domDebuggerModel, eventTarget, type, useCapture, passive, once, handler, originalHandler, location, customRemoveFunction, origin) {
        this.#domDebuggerModel = domDebuggerModel;
        this.#eventTarget = eventTarget;
        this.#type = type;
        this.#useCapture = useCapture;
        this.#passive = passive;
        this.#once = once;
        this.#handler = handler;
        this.#originalHandler = originalHandler || handler;
        this.#location = location;
        const script = location.script();
        this.#sourceURL = script ? script.contentURL() : Platform.DevToolsPath.EmptyUrlString;
        this.#customRemoveFunction = customRemoveFunction;
        this.#origin = origin || "Raw" /* EventListener.Origin.RAW */;
    }
    domDebuggerModel() {
        return this.#domDebuggerModel;
    }
    type() {
        return this.#type;
    }
    useCapture() {
        return this.#useCapture;
    }
    passive() {
        return this.#passive;
    }
    once() {
        return this.#once;
    }
    handler() {
        return this.#handler;
    }
    location() {
        return this.#location;
    }
    sourceURL() {
        return this.#sourceURL;
    }
    originalHandler() {
        return this.#originalHandler;
    }
    canRemove() {
        return Boolean(this.#customRemoveFunction) || this.#origin !== "FrameworkUser" /* EventListener.Origin.FRAMEWORK_USER */;
    }
    remove() {
        if (!this.canRemove()) {
            return Promise.resolve(undefined);
        }
        if (this.#origin !== "FrameworkUser" /* EventListener.Origin.FRAMEWORK_USER */) {
            function removeListener(type, listener, useCapture) {
                this.removeEventListener(type, listener, useCapture);
                // @ts-expect-error:
                if (this['on' + type]) {
                    // @ts-expect-error:
                    this['on' + type] = undefined;
                }
            }
            return this.#eventTarget
                .callFunction(removeListener, [
                RemoteObject.toCallArgument(this.#type),
                RemoteObject.toCallArgument(this.#originalHandler),
                RemoteObject.toCallArgument(this.#useCapture),
            ])
                .then(() => undefined);
        }
        if (this.#customRemoveFunction) {
            function callCustomRemove(type, listener, useCapture, passive) {
                this.call(null, type, listener, useCapture, passive);
            }
            return this.#customRemoveFunction
                .callFunction(callCustomRemove, [
                RemoteObject.toCallArgument(this.#type),
                RemoteObject.toCallArgument(this.#originalHandler),
                RemoteObject.toCallArgument(this.#useCapture),
                RemoteObject.toCallArgument(this.#passive),
            ])
                .then(() => undefined);
        }
        return Promise.resolve(undefined);
    }
    canTogglePassive() {
        return this.#origin !== "FrameworkUser" /* EventListener.Origin.FRAMEWORK_USER */;
    }
    togglePassive() {
        return this.#eventTarget
            .callFunction(callTogglePassive, [
            RemoteObject.toCallArgument(this.#type),
            RemoteObject.toCallArgument(this.#originalHandler),
            RemoteObject.toCallArgument(this.#useCapture),
            RemoteObject.toCallArgument(this.#passive),
        ])
            .then(() => undefined);
        function callTogglePassive(type, listener, useCapture, passive) {
            this.removeEventListener(type, listener, { capture: useCapture });
            this.addEventListener(type, listener, { capture: useCapture, passive: !passive });
        }
    }
    origin() {
        return this.#origin;
    }
    markAsFramework() {
        this.#origin = "Framework" /* EventListener.Origin.FRAMEWORK */;
    }
    isScrollBlockingType() {
        return this.#type === 'touchstart' || this.#type === 'touchmove' || this.#type === 'mousewheel' ||
            this.#type === 'wheel';
    }
}
export class CSPViolationBreakpoint extends CategorizedBreakpoint {
    #type;
    constructor(category, type) {
        super(category, type);
        this.#type = type;
    }
    type() {
        return this.#type;
    }
}
export class DOMEventListenerBreakpoint extends CategorizedBreakpoint {
    eventTargetNames;
    #targetManager;
    constructor(eventName, eventTargetNames, category, targetManager) {
        super(category, eventName);
        this.eventTargetNames = eventTargetNames;
        this.#targetManager = targetManager;
    }
    setEnabled(enabled) {
        if (this.enabled() === enabled) {
            return;
        }
        super.setEnabled(enabled);
        for (const model of this.#targetManager.models(DOMDebuggerModel)) {
            this.updateOnModel(model);
        }
    }
    updateOnModel(model) {
        for (const eventTargetName of this.eventTargetNames) {
            if (this.enabled()) {
                void model.agent.invoke_setEventListenerBreakpoint({ eventName: this.name, targetName: eventTargetName });
            }
            else {
                void model.agent.invoke_removeEventListenerBreakpoint({ eventName: this.name, targetName: eventTargetName });
            }
        }
    }
    static listener = 'listener:';
}
export class DOMDebuggerManager {
    #xhrBreakpointsSetting;
    #xhrBreakpoints = new Map();
    #cspViolationsToBreakOn = [];
    #eventListenerBreakpoints = [];
    #targetManager;
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    constructor(targetManager = TargetManager.instance()) {
        this.#targetManager = targetManager;
        this.#xhrBreakpointsSetting = this.#targetManager.settings.createLocalSetting('xhr-breakpoints', []);
        for (const breakpoint of this.#xhrBreakpointsSetting.get()) {
            this.#xhrBreakpoints.set(breakpoint.url, breakpoint.enabled);
        }
        this.#cspViolationsToBreakOn.push(new CSPViolationBreakpoint("trusted-type-violation" /* Category.TRUSTED_TYPE_VIOLATION */, "trustedtype-sink-violation" /* Protocol.DOMDebugger.CSPViolationType.TrustedtypeSinkViolation */));
        this.#cspViolationsToBreakOn.push(new CSPViolationBreakpoint("trusted-type-violation" /* Category.TRUSTED_TYPE_VIOLATION */, "trustedtype-policy-violation" /* Protocol.DOMDebugger.CSPViolationType.TrustedtypePolicyViolation */));
        this.createEventListenerBreakpoints("media" /* Category.MEDIA */, [
            'play', 'pause', 'playing', 'canplay', 'canplaythrough', 'seeking',
            'seeked', 'timeupdate', 'ended', 'ratechange', 'durationchange', 'volumechange',
            'loadstart', 'progress', 'suspend', 'abort', 'error', 'emptied',
            'stalled', 'loadedmetadata', 'loadeddata', 'waiting',
        ], ['audio', 'video']);
        this.createEventListenerBreakpoints("picture-in-picture" /* Category.PICTURE_IN_PICTURE */, ['enterpictureinpicture', 'leavepictureinpicture'], ['video']);
        this.createEventListenerBreakpoints("picture-in-picture" /* Category.PICTURE_IN_PICTURE */, ['resize'], ['PictureInPictureWindow']);
        this.createEventListenerBreakpoints("picture-in-picture" /* Category.PICTURE_IN_PICTURE */, ['enter'], ['documentPictureInPicture']);
        this.createEventListenerBreakpoints("clipboard" /* Category.CLIPBOARD */, ['copy', 'cut', 'paste', 'beforecopy', 'beforecut', 'beforepaste'], ['*']);
        this.createEventListenerBreakpoints("control" /* Category.CONTROL */, [
            'resize',
            'scroll',
            'scrollend',
            'scrollsnapchange',
            'scrollsnapchanging',
            'zoom',
            'focus',
            'blur',
            'select',
            'change',
            'submit',
            'reset',
        ], ['*']);
        this.createEventListenerBreakpoints("device" /* Category.DEVICE */, ['deviceorientation', 'devicemotion'], ['*']);
        this.createEventListenerBreakpoints("dom-mutation" /* Category.DOM_MUTATION */, [
            'DOMActivate',
            'DOMFocusIn',
            'DOMFocusOut',
            'DOMAttrModified',
            'DOMCharacterDataModified',
            'DOMNodeInserted',
            'DOMNodeInsertedIntoDocument',
            'DOMNodeRemoved',
            'DOMNodeRemovedFromDocument',
            'DOMSubtreeModified',
            'DOMContentLoaded',
        ], ['*']);
        this.createEventListenerBreakpoints("drag-drop" /* Category.DRAG_DROP */, ['drag', 'dragstart', 'dragend', 'dragenter', 'dragover', 'dragleave', 'drop'], ['*']);
        this.createEventListenerBreakpoints("keyboard" /* Category.KEYBOARD */, ['keydown', 'keyup', 'keypress', 'input'], ['*']);
        this.createEventListenerBreakpoints("load" /* Category.LOAD */, [
            'load',
            'beforeunload',
            'unload',
            'abort',
            'error',
            'hashchange',
            'popstate',
            'navigate',
            'navigatesuccess',
            'navigateerror',
            'currentchange',
            'navigateto',
            'navigatefrom',
            'finish',
            'dispose',
        ], ['*']);
        this.createEventListenerBreakpoints("mouse" /* Category.MOUSE */, [
            'auxclick',
            'click',
            'dblclick',
            'mousedown',
            'mouseup',
            'mouseover',
            'mousemove',
            'mouseout',
            'mouseenter',
            'mouseleave',
            'mousewheel',
            'wheel',
            'contextmenu',
        ], ['*']);
        this.createEventListenerBreakpoints("pointer" /* Category.POINTER */, [
            'pointerover',
            'pointerout',
            'pointerenter',
            'pointerleave',
            'pointerdown',
            'pointerup',
            'pointermove',
            'pointercancel',
            'gotpointercapture',
            'lostpointercapture',
            'pointerrawupdate',
        ], ['*']);
        this.createEventListenerBreakpoints("touch" /* Category.TOUCH */, ['touchstart', 'touchmove', 'touchend', 'touchcancel'], ['*']);
        this.createEventListenerBreakpoints("worker" /* Category.WORKER */, ['message', 'messageerror'], ['*']);
        this.createEventListenerBreakpoints("xhr" /* Category.XHR */, ['readystatechange', 'load', 'loadstart', 'loadend', 'abort', 'error', 'progress', 'timeout'], ['xmlhttprequest', 'xmlhttprequestupload']);
    }
    initialize() {
        this.#targetManager.observeModels(DOMDebuggerModel, this);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew, targetManager } = opts;
        if (!Root.DevToolsContext.globalInstance().has(DOMDebuggerManager) || forceNew) {
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            const manager = new DOMDebuggerManager(targetManager ?? TargetManager.instance());
            manager.initialize();
            Root.DevToolsContext.globalInstance().set(DOMDebuggerManager, manager);
        }
        return Root.DevToolsContext.globalInstance().get(DOMDebuggerManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(DOMDebuggerManager);
    }
    cspViolationBreakpoints() {
        return this.#cspViolationsToBreakOn.slice();
    }
    createEventListenerBreakpoints(category, eventNames, eventTargetNames) {
        for (const eventName of eventNames) {
            this.#eventListenerBreakpoints.push(new DOMEventListenerBreakpoint(eventName, eventTargetNames, category, this.#targetManager));
        }
    }
    resolveEventListenerBreakpoint({ eventName, targetName }) {
        const listenerPrefix = 'listener:';
        if (eventName.startsWith(listenerPrefix)) {
            eventName = eventName.substring(listenerPrefix.length);
        }
        else {
            return null;
        }
        targetName = (targetName || '*').toLowerCase();
        let result = null;
        for (const breakpoint of this.#eventListenerBreakpoints) {
            if (eventName && breakpoint.name === eventName && breakpoint.eventTargetNames.indexOf(targetName) !== -1) {
                result = breakpoint;
            }
            if (!result && eventName && breakpoint.name === eventName && breakpoint.eventTargetNames.indexOf('*') !== -1) {
                result = breakpoint;
            }
        }
        return result;
    }
    eventListenerBreakpoints() {
        return this.#eventListenerBreakpoints.slice();
    }
    updateCSPViolationBreakpoints() {
        const violationTypes = this.#cspViolationsToBreakOn.filter(v => v.enabled()).map(v => v.type());
        for (const model of this.#targetManager.models(DOMDebuggerModel)) {
            this.updateCSPViolationBreakpointsForModel(model, violationTypes);
        }
    }
    updateCSPViolationBreakpointsForModel(model, violationTypes) {
        void model.agent.invoke_setBreakOnCSPViolation({ violationTypes });
    }
    xhrBreakpoints() {
        return this.#xhrBreakpoints;
    }
    saveXHRBreakpoints() {
        const breakpoints = [];
        for (const url of this.#xhrBreakpoints.keys()) {
            breakpoints.push({ url, enabled: this.#xhrBreakpoints.get(url) || false });
        }
        this.#xhrBreakpointsSetting.set(breakpoints);
    }
    addXHRBreakpoint(url, enabled) {
        this.#xhrBreakpoints.set(url, enabled);
        if (enabled) {
            for (const model of this.#targetManager.models(DOMDebuggerModel)) {
                void model.agent.invoke_setXHRBreakpoint({ url });
            }
        }
        this.saveXHRBreakpoints();
    }
    removeXHRBreakpoint(url) {
        const enabled = this.#xhrBreakpoints.get(url);
        this.#xhrBreakpoints.delete(url);
        if (enabled) {
            for (const model of this.#targetManager.models(DOMDebuggerModel)) {
                void model.agent.invoke_removeXHRBreakpoint({ url });
            }
        }
        this.saveXHRBreakpoints();
    }
    toggleXHRBreakpoint(url, enabled) {
        this.#xhrBreakpoints.set(url, enabled);
        for (const model of this.#targetManager.models(DOMDebuggerModel)) {
            if (enabled) {
                void model.agent.invoke_setXHRBreakpoint({ url });
            }
            else {
                void model.agent.invoke_removeXHRBreakpoint({ url });
            }
        }
        this.saveXHRBreakpoints();
    }
    modelAdded(domDebuggerModel) {
        for (const url of this.#xhrBreakpoints.keys()) {
            if (this.#xhrBreakpoints.get(url)) {
                void domDebuggerModel.agent.invoke_setXHRBreakpoint({ url });
            }
        }
        for (const breakpoint of this.#eventListenerBreakpoints) {
            if (breakpoint.enabled()) {
                breakpoint.updateOnModel(domDebuggerModel);
            }
        }
        const violationTypes = this.#cspViolationsToBreakOn.filter(v => v.enabled()).map(v => v.type());
        this.updateCSPViolationBreakpointsForModel(domDebuggerModel, violationTypes);
    }
    modelRemoved(_domDebuggerModel) {
    }
}
SDKModel.register(DOMDebuggerModel, { capabilities: 2 /* Capability.DOM */, autostart: false });
//# sourceMappingURL=DOMDebuggerModel.js.map