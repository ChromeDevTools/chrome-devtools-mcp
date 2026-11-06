// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as ProtocolClient from '../protocol_client/protocol_client.js';
import { SDKModel } from './SDKModel.js';
import { SecurityOrigin } from './SecurityOrigin.js';
export class Target extends ProtocolClient.InspectorBackend.TargetBase {
    #targetManager;
    #name;
    #inspectedURL = Platform.DevToolsPath.EmptyUrlString;
    #inspectedURLName = '';
    /** Caches the parsed security origin for `#inspectedURL`. */
    #inspectedSecurityOrigin = null;
    #capabilitiesMask;
    #type;
    #parentTarget;
    #id;
    #modelByConstructor = new Map();
    #isSuspended;
    /**
     * Generally when a target crashes we don't need to know, with one exception.
     * If a target crashes during the recording of a performance trace, after the
     * trace when we try to resume() it, it will fail because it has crashed. This
     * causes the performance panel to freeze (see crbug.com/333989070). So we
     * mark the target as crashed so we can exit without trying to resume it. In
     * `ChildTargetManager` we will mark a target as "un-crashed" when we get the
     * `targetInfoChanged` event. This helps ensure we can deal with cases where
     * the page crashes, but a reload fixes it and the targets get restored (see
     * crbug.com/387258086).
     */
    #hasCrashed = false;
    #targetInfo;
    #creatingModels;
    constructor(targetManager, id, name, type, parentTarget, sessionId, suspended, connection, targetInfo) {
        super(parentTarget, sessionId, connection);
        this.#targetManager = targetManager;
        this.#name = name;
        this.#capabilitiesMask = 0;
        switch (type) {
            case Type.FRAME:
                this.#capabilitiesMask = 1 /* Capability.BROWSER */ | 8192 /* Capability.STORAGE */ | 2 /* Capability.DOM */ | 4 /* Capability.JS */ | 8 /* Capability.LOG */ | 16 /* Capability.NETWORK */ | 32 /* Capability.TARGET */ | 128 /* Capability.TRACING */ | 256 /* Capability.EMULATION */ | 1024 /* Capability.INPUT */ | 2048 /* Capability.INSPECTOR */ | 32768 /* Capability.AUDITS */ | 65536 /* Capability.WEB_AUTHN */ | 131072 /* Capability.IO */ | 262144 /* Capability.MEDIA */ | 524288 /* Capability.EVENT_BREAKPOINTS */ | 1048576 /* Capability.DOM_STORAGE */ | 2097152 /* Capability.WEB_MCP */;
                if (parentTarget?.type() !== Type.FRAME) {
                    // This matches backend exposing certain capabilities only for the main frame.
                    this.#capabilitiesMask |=
                        4096 /* Capability.DEVICE_EMULATION */ | 64 /* Capability.SCREEN_CAPTURE */ | 512 /* Capability.SECURITY */ | 16384 /* Capability.SERVICE_WORKER */;
                    if (Common.ParsedURL.schemeIs(targetInfo?.url, 'chrome-extension:')) {
                        this.#capabilitiesMask &= ~512 /* Capability.SECURITY */;
                    }
                    // TODO(dgozman): we report service workers for the whole frame tree on the main frame,
                    // while we should be able to only cover the subtree corresponding to the target.
                }
                break;
            case Type.ServiceWorker:
                this.#capabilitiesMask = 4 /* Capability.JS */ | 8 /* Capability.LOG */ | 16 /* Capability.NETWORK */ | 32 /* Capability.TARGET */ | 2048 /* Capability.INSPECTOR */ | 131072 /* Capability.IO */ | 524288 /* Capability.EVENT_BREAKPOINTS */;
                if (parentTarget?.type() !== Type.FRAME) {
                    this.#capabilitiesMask |= 1 /* Capability.BROWSER */ | 8192 /* Capability.STORAGE */;
                }
                break;
            case Type.SHARED_WORKER:
                this.#capabilitiesMask = 4 /* Capability.JS */ | 8 /* Capability.LOG */ | 16 /* Capability.NETWORK */ | 32 /* Capability.TARGET */ | 131072 /* Capability.IO */ | 262144 /* Capability.MEDIA */ | 2048 /* Capability.INSPECTOR */ | 524288 /* Capability.EVENT_BREAKPOINTS */;
                if (parentTarget?.type() !== Type.FRAME) {
                    this.#capabilitiesMask |= 8192 /* Capability.STORAGE */;
                }
                break;
            case Type.Worker:
                this.#capabilitiesMask = 4 /* Capability.JS */ | 8 /* Capability.LOG */ | 16 /* Capability.NETWORK */ | 32 /* Capability.TARGET */ | 131072 /* Capability.IO */ | 262144 /* Capability.MEDIA */ | 256 /* Capability.EMULATION */ | 524288 /* Capability.EVENT_BREAKPOINTS */;
                if (parentTarget?.type() !== Type.FRAME) {
                    this.#capabilitiesMask |= 8192 /* Capability.STORAGE */;
                }
                break;
            case Type.WORKLET:
                this.#capabilitiesMask = 4 /* Capability.JS */ | 8 /* Capability.LOG */ | 524288 /* Capability.EVENT_BREAKPOINTS */ | 16 /* Capability.NETWORK */;
                break;
            case Type.NODE:
                this.#capabilitiesMask =
                    4 /* Capability.JS */ | 16 /* Capability.NETWORK */ | 32 /* Capability.TARGET */ | 131072 /* Capability.IO */ | 1048576 /* Capability.DOM_STORAGE */;
                break;
            case Type.AUCTION_WORKLET:
                this.#capabilitiesMask = 4 /* Capability.JS */ | 524288 /* Capability.EVENT_BREAKPOINTS */;
                break;
            case Type.BROWSER:
                this.#capabilitiesMask = 32 /* Capability.TARGET */ | 131072 /* Capability.IO */;
                break;
            case Type.TAB:
                this.#capabilitiesMask = 32 /* Capability.TARGET */ | 128 /* Capability.TRACING */;
                break;
            case Type.NODE_WORKER:
                this.#capabilitiesMask = 4 /* Capability.JS */ | 16 /* Capability.NETWORK */ | 32 /* Capability.TARGET */ | 131072 /* Capability.IO */;
        }
        this.#type = type;
        this.#parentTarget = parentTarget;
        this.#id = id;
        this.#isSuspended = suspended;
        this.#targetInfo = targetInfo;
    }
    /** Creates the models in the order in which they are provided */
    createModels(models) {
        this.#creatingModels = true;
        for (const model of models) {
            this.model(model);
        }
        this.#creatingModels = false;
    }
    id() {
        return this.#id;
    }
    name() {
        return this.#name || this.#inspectedURLName;
    }
    setName(name) {
        if (this.#name === name) {
            return;
        }
        this.#name = name;
        this.#targetManager.onNameChange(this);
    }
    type() {
        return this.#type;
    }
    markAsNodeJSForTest() {
        this.#type = Type.NODE;
    }
    targetManager() {
        return this.#targetManager;
    }
    hasAllCapabilities(capabilitiesMask) {
        // TODO(dgozman): get rid of this method, once we never observe targets with
        // capability mask.
        return (this.#capabilitiesMask & capabilitiesMask) === capabilitiesMask;
    }
    decorateLabel(label) {
        return (this.#type === Type.Worker || this.#type === Type.ServiceWorker) ? '\u2699 ' + label : label;
    }
    parentTarget() {
        return this.#parentTarget;
    }
    outermostTarget() {
        let lastTarget = null;
        let currentTarget = this;
        do {
            if (currentTarget.type() !== Type.TAB && currentTarget.type() !== Type.BROWSER) {
                lastTarget = currentTarget;
            }
            currentTarget = currentTarget.parentTarget();
        } while (currentTarget);
        return lastTarget;
    }
    dispose(reason) {
        super.dispose(reason);
        this.#targetManager.removeTarget(this);
        for (const model of this.#modelByConstructor.values()) {
            model.dispose();
        }
    }
    model(modelClass) {
        if (!this.#modelByConstructor.get(modelClass)) {
            const info = SDKModel.registeredModels.get(modelClass);
            if (info === undefined) {
                throw new Error('Model class is not registered');
            }
            if ((this.#capabilitiesMask & info.capabilities) === info.capabilities) {
                const model = new modelClass(this);
                this.#modelByConstructor.set(modelClass, model);
                if (!this.#creatingModels) {
                    this.#targetManager.modelAdded(modelClass, model, this.#targetManager.isInScope(this));
                }
            }
        }
        return this.#modelByConstructor.get(modelClass) || null;
    }
    models() {
        return this.#modelByConstructor;
    }
    inspectedURL() {
        return this.#inspectedURL;
    }
    /**
     * Returns the security origin for this target's inspected URL.
     *
     * The target caches the origin until `setInspectedURL()` changes the URL.
     * If the URL is empty or invalid, this method returns a unique opaque origin.
     * An opaque origin does not match any other origin.
     */
    inspectedSecurityOrigin() {
        if (!this.#inspectedSecurityOrigin) {
            this.#inspectedSecurityOrigin = SecurityOrigin.create(this.#inspectedURL);
        }
        return this.#inspectedSecurityOrigin;
    }
    setInspectedURL(inspectedURL) {
        this.#inspectedURL = inspectedURL;
        this.#inspectedSecurityOrigin = null;
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(inspectedURL);
        this.#inspectedURLName = parsedURL ? parsedURL.lastPathComponentWithFragment() : '#' + this.#id;
        this.#targetManager.onInspectedURLChange(this);
        if (!this.#name) {
            this.#targetManager.onNameChange(this);
        }
    }
    hasCrashed() {
        return this.#hasCrashed;
    }
    setHasCrashed(isCrashed) {
        const wasCrashed = this.#hasCrashed;
        this.#hasCrashed = isCrashed;
        // If the target has now been restored, check to see if it needs resuming.
        // This ensures that if a target crashes whilst suspended, it is resumed
        // when it is recovered.
        // If the target is not suspended, resume() is a no-op, so it's safe to call.
        if (wasCrashed && !isCrashed) {
            void this.resume();
        }
    }
    async suspend(reason) {
        if (this.#isSuspended) {
            return;
        }
        this.#isSuspended = true;
        // If the target has crashed, we will not attempt to suspend all the
        // models, but we still mark it as suspended so we correctly track the
        // state.
        if (this.#hasCrashed) {
            return;
        }
        await Promise.all(Array.from(this.models().values(), m => m.preSuspendModel(reason)));
        await Promise.all(Array.from(this.models().values(), m => m.suspendModel(reason)));
    }
    async resume() {
        if (!this.#isSuspended) {
            return;
        }
        this.#isSuspended = false;
        if (this.#hasCrashed) {
            return;
        }
        await Promise.all(Array.from(this.models().values(), m => m.resumeModel()));
        await Promise.all(Array.from(this.models().values(), m => m.postResumeModel()));
    }
    suspended() {
        return this.#isSuspended;
    }
    updateTargetInfo(targetInfo) {
        this.#targetInfo = targetInfo;
    }
    targetInfo() {
        return this.#targetInfo;
    }
}
export var Type;
(function (Type) {
    Type["FRAME"] = "frame";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Used by web_tests.
    Type["ServiceWorker"] = "service-worker";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Used by web_tests.
    Type["Worker"] = "worker";
    Type["SHARED_WORKER"] = "shared-worker";
    Type["NODE"] = "node";
    Type["BROWSER"] = "browser";
    Type["AUCTION_WORKLET"] = "auction-worklet";
    Type["WORKLET"] = "worklet";
    Type["TAB"] = "tab";
    Type["NODE_WORKER"] = "node-worker";
})(Type || (Type = {}));
export var Capability;
(function (Capability) {
    Capability[Capability["BROWSER"] = 1] = "BROWSER";
    Capability[Capability["DOM"] = 2] = "DOM";
    Capability[Capability["JS"] = 4] = "JS";
    Capability[Capability["LOG"] = 8] = "LOG";
    Capability[Capability["NETWORK"] = 16] = "NETWORK";
    Capability[Capability["TARGET"] = 32] = "TARGET";
    Capability[Capability["SCREEN_CAPTURE"] = 64] = "SCREEN_CAPTURE";
    Capability[Capability["TRACING"] = 128] = "TRACING";
    Capability[Capability["EMULATION"] = 256] = "EMULATION";
    Capability[Capability["SECURITY"] = 512] = "SECURITY";
    Capability[Capability["INPUT"] = 1024] = "INPUT";
    Capability[Capability["INSPECTOR"] = 2048] = "INSPECTOR";
    Capability[Capability["DEVICE_EMULATION"] = 4096] = "DEVICE_EMULATION";
    Capability[Capability["STORAGE"] = 8192] = "STORAGE";
    Capability[Capability["SERVICE_WORKER"] = 16384] = "SERVICE_WORKER";
    Capability[Capability["AUDITS"] = 32768] = "AUDITS";
    Capability[Capability["WEB_AUTHN"] = 65536] = "WEB_AUTHN";
    Capability[Capability["IO"] = 131072] = "IO";
    Capability[Capability["MEDIA"] = 262144] = "MEDIA";
    Capability[Capability["EVENT_BREAKPOINTS"] = 524288] = "EVENT_BREAKPOINTS";
    Capability[Capability["DOM_STORAGE"] = 1048576] = "DOM_STORAGE";
    Capability[Capability["WEB_MCP"] = 2097152] = "WEB_MCP";
    Capability[Capability["NONE"] = 0] = "NONE";
})(Capability || (Capability = {}));
//# sourceMappingURL=Target.js.map