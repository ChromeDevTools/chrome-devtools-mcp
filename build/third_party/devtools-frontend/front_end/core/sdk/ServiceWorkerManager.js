// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import { Events as RuntimeModelEvents, RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { Type } from './Target.js';
const UIStrings = {
    /**
     * @description Service worker running status displayed in the Service Workers view in the Application panel.
     */
    running: 'running',
    /**
     * @description Service worker running status displayed in the Service Workers view in the Application panel.
     */
    starting: 'starting',
    /**
     * @description Service worker running status displayed in the Service Workers view in the Application panel.
     */
    stopped: 'stopped',
    /**
     * @description Service worker running status displayed in the Service Workers view in the Application panel.
     */
    stopping: 'stopping',
    /**
     * @description Service worker version status displayed in the Threads view of the Debugging sidebar in the Sources panel.
     */
    activated: 'activated',
    /**
     * @description Service worker version status displayed in the Threads view of the Debugging sidebar in the Sources panel.
     */
    activating: 'activating',
    /**
     * @description Service worker version status displayed in the Threads view of the Debugging sidebar in the Sources panel.
     */
    installed: 'installed',
    /**
     * @description Service worker version status displayed in the Threads view of the Debugging sidebar in the Sources panel.
     */
    installing: 'installing',
    /**
     * @description Service worker version status displayed in the Threads view of the Debugging sidebar in the Sources panel.
     */
    new: 'new',
    /**
     * @description Service worker version status displayed in the Threads view of the Debugging sidebar in the Sources panel.
     */
    redundant: 'redundant',
    /**
     * @description Service worker version status displayed in the Threads view of the Debugging sidebar in the Sources panel.
     * @example {sw.js} PH1
     * @example {117} PH2
     * @example {activated} PH3
     */
    sSS: '{PH1} #{PH2} ({PH3})',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/ServiceWorkerManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class ServiceWorkerManager extends SDKModel {
    #agent;
    #registrations = new Map();
    #enabled = false;
    #forceUpdateSetting;
    #networkManager;
    constructor(target) {
        super(target);
        this.#networkManager = target.targetManager().getNetworkManager();
        target.registerServiceWorkerDispatcher(new ServiceWorkerDispatcher(this));
        this.#agent = target.serviceWorkerAgent();
        void this.enable();
        this.#forceUpdateSetting = target.targetManager().settings.createSetting('service-worker-update-on-reload', false);
        if (this.#forceUpdateSetting.get()) {
            this.forceUpdateSettingChanged();
        }
        this.#forceUpdateSetting.addChangeListener(this.forceUpdateSettingChanged, this);
        this.#networkManager.addEventListener("ConditionsChanged" /* MultitargetNetworkManager.Events.CONDITIONS_CHANGED */, this.forceUpdateSettingChanged, this);
        new ServiceWorkerContextNamer(target, this);
    }
    dispose() {
        this.#networkManager.removeEventListener("ConditionsChanged" /* MultitargetNetworkManager.Events.CONDITIONS_CHANGED */, this.forceUpdateSettingChanged, this);
        super.dispose();
    }
    async enable() {
        if (this.#enabled) {
            return;
        }
        this.#enabled = true;
        await this.#agent.invoke_enable();
    }
    async disable() {
        if (!this.#enabled) {
            return;
        }
        this.#enabled = false;
        this.#registrations.clear();
        await this.#agent.invoke_enable();
    }
    registrations() {
        return this.#registrations;
    }
    findVersion(versionId) {
        for (const registration of this.registrations().values()) {
            const version = registration.versions.get(versionId);
            if (version) {
                return version;
            }
        }
        return null;
    }
    deleteRegistration(registrationId) {
        const registration = this.#registrations.get(registrationId);
        if (!registration) {
            return;
        }
        if (registration.isRedundant()) {
            this.#registrations.delete(registrationId);
            this.dispatchEventToListeners("RegistrationDeleted" /* Events.REGISTRATION_DELETED */, registration);
            return;
        }
        registration.deleting = true;
        for (const version of registration.versions.values()) {
            void this.stopWorker(version.id);
        }
        void this.unregister(registration.scopeURL);
    }
    async updateRegistration(registrationId) {
        const registration = this.#registrations.get(registrationId);
        if (!registration) {
            return;
        }
        await this.#agent.invoke_updateRegistration({ scopeURL: registration.scopeURL });
    }
    async deliverPushMessage(registrationId, data) {
        const registration = this.#registrations.get(registrationId);
        if (!registration) {
            return;
        }
        const origin = Common.ParsedURL.ParsedURL.extractOrigin(registration.scopeURL);
        await this.#agent.invoke_deliverPushMessage({ origin, registrationId, data });
    }
    async dispatchSyncEvent(registrationId, tag, lastChance) {
        const registration = this.#registrations.get(registrationId);
        if (!registration) {
            return;
        }
        const origin = Common.ParsedURL.ParsedURL.extractOrigin(registration.scopeURL);
        await this.#agent.invoke_dispatchSyncEvent({ origin, registrationId, tag, lastChance });
    }
    async dispatchPeriodicSyncEvent(registrationId, tag) {
        const registration = this.#registrations.get(registrationId);
        if (!registration) {
            return;
        }
        const origin = Common.ParsedURL.ParsedURL.extractOrigin(registration.scopeURL);
        await this.#agent.invoke_dispatchPeriodicSyncEvent({ origin, registrationId, tag });
    }
    async unregister(scopeURL) {
        await this.#agent.invoke_unregister({ scopeURL });
    }
    async startWorker(scopeURL) {
        await this.#agent.invoke_startWorker({ scopeURL });
    }
    async skipWaiting(scopeURL) {
        await this.#agent.invoke_skipWaiting({ scopeURL });
    }
    async stopWorker(versionId) {
        await this.#agent.invoke_stopWorker({ versionId });
    }
    workerRegistrationUpdated(registrations) {
        for (const payload of registrations) {
            let registration = this.#registrations.get(payload.registrationId);
            if (!registration) {
                registration = new ServiceWorkerRegistration(payload);
                this.#registrations.set(payload.registrationId, registration);
                this.dispatchEventToListeners("RegistrationUpdated" /* Events.REGISTRATION_UPDATED */, registration);
                continue;
            }
            registration.update(payload);
            if (registration.shouldBeRemoved()) {
                this.#registrations.delete(registration.id);
                this.dispatchEventToListeners("RegistrationDeleted" /* Events.REGISTRATION_DELETED */, registration);
            }
            else {
                this.dispatchEventToListeners("RegistrationUpdated" /* Events.REGISTRATION_UPDATED */, registration);
            }
        }
    }
    workerVersionUpdated(versions) {
        const registrations = new Set();
        for (const payload of versions) {
            const registration = this.#registrations.get(payload.registrationId);
            if (!registration) {
                continue;
            }
            registration.updateVersion(payload);
            registrations.add(registration);
        }
        for (const registration of registrations) {
            if (registration.shouldBeRemoved()) {
                this.#registrations.delete(registration.id);
                this.dispatchEventToListeners("RegistrationDeleted" /* Events.REGISTRATION_DELETED */, registration);
            }
            else {
                this.dispatchEventToListeners("RegistrationUpdated" /* Events.REGISTRATION_UPDATED */, registration);
            }
        }
    }
    workerErrorReported(payload) {
        const registration = this.#registrations.get(payload.registrationId);
        if (!registration) {
            return;
        }
        registration.errors.push(payload);
        this.dispatchEventToListeners("RegistrationErrorAdded" /* Events.REGISTRATION_ERROR_ADDED */, { registration, error: payload });
    }
    forceUpdateSettingChanged() {
        const forceUpdateOnPageLoad = this.#forceUpdateSetting.get() && !this.#networkManager.isOffline();
        void this.#agent.invoke_setForceUpdateOnPageLoad({ forceUpdateOnPageLoad });
    }
}
export var Events;
(function (Events) {
    Events["REGISTRATION_UPDATED"] = "RegistrationUpdated";
    Events["REGISTRATION_ERROR_ADDED"] = "RegistrationErrorAdded";
    Events["REGISTRATION_DELETED"] = "RegistrationDeleted";
})(Events || (Events = {}));
class ServiceWorkerDispatcher {
    #manager;
    constructor(manager) {
        this.#manager = manager;
    }
    workerRegistrationUpdated({ registrations }) {
        this.#manager.workerRegistrationUpdated(registrations);
    }
    workerVersionUpdated({ versions }) {
        this.#manager.workerVersionUpdated(versions);
    }
    workerErrorReported({ errorMessage }) {
        this.#manager.workerErrorReported(errorMessage);
    }
}
/**
 * For every version, we keep a history of ServiceWorkerVersionState. Every time
 * a version is updated we will add a new state at the head of the history chain.
 * This history tells us information such as what the current state is, or when
 * the version becomes installed.
 */
export class ServiceWorkerVersionState {
    runningStatus;
    status;
    lastUpdatedTimestamp;
    previousState;
    constructor(runningStatus, status, previousState, timestamp) {
        this.runningStatus = runningStatus;
        this.status = status;
        this.lastUpdatedTimestamp = timestamp;
        this.previousState = previousState;
    }
}
export class ServiceWorkerRouterRule {
    condition;
    source;
    id;
    constructor(condition, source, id) {
        this.condition = condition;
        this.source = source;
        this.id = id;
    }
}
export class ServiceWorkerVersion {
    id;
    scriptURL;
    parsedURL;
    securityOrigin;
    scriptLastModified;
    scriptResponseTime;
    controlledClients;
    targetId;
    routerRules;
    currentState;
    registration;
    constructor(registration, payload) {
        this.registration = registration;
        this.update(payload);
    }
    update(payload) {
        this.id = payload.versionId;
        this.scriptURL = payload.scriptURL;
        const parsedURL = new Common.ParsedURL.ParsedURL(payload.scriptURL);
        this.securityOrigin = parsedURL.securityOrigin();
        this.currentState =
            new ServiceWorkerVersionState(payload.runningStatus, payload.status, this.currentState, Date.now());
        this.scriptLastModified = payload.scriptLastModified;
        this.scriptResponseTime = payload.scriptResponseTime;
        if (payload.controlledClients) {
            this.controlledClients = payload.controlledClients.slice();
        }
        else {
            this.controlledClients = [];
        }
        this.targetId = payload.targetId || null;
        this.routerRules = null;
        if (payload.typedRouterRules) {
            this.routerRules = this.parseTypedRules(payload.typedRouterRules);
        }
        else if (payload.routerRules) {
            this.routerRules = this.parseJSONRules(payload.routerRules);
        }
    }
    isStartable() {
        return !this.registration.isDeleted && this.isActivated() && this.isStopped();
    }
    isStoppedAndRedundant() {
        return this.runningStatus === "stopped" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopped */ &&
            this.status === "redundant" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Redundant */;
    }
    isStopped() {
        return this.runningStatus === "stopped" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopped */;
    }
    isStarting() {
        return this.runningStatus === "starting" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Starting */;
    }
    isRunning() {
        return this.runningStatus === "running" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Running */;
    }
    isStopping() {
        return this.runningStatus === "stopping" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopping */;
    }
    isNew() {
        return this.status === "new" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.New */;
    }
    isInstalling() {
        return this.status === "installing" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Installing */;
    }
    isInstalled() {
        return this.status === "installed" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Installed */;
    }
    isActivating() {
        return this.status === "activating" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Activating */;
    }
    isActivated() {
        return this.status === "activated" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Activated */;
    }
    isRedundant() {
        return this.status === "redundant" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Redundant */;
    }
    get status() {
        return this.currentState.status;
    }
    get runningStatus() {
        return this.currentState.runningStatus;
    }
    mode() {
        if (this.isNew() || this.isInstalling()) {
            return "installing" /* ServiceWorkerVersion.Modes.INSTALLING */;
        }
        if (this.isInstalled()) {
            return "waiting" /* ServiceWorkerVersion.Modes.WAITING */;
        }
        if (this.isActivating() || this.isActivated()) {
            return "active" /* ServiceWorkerVersion.Modes.ACTIVE */;
        }
        return "redundant" /* ServiceWorkerVersion.Modes.REDUNDANT */;
    }
    parseJSONRules(input) {
        try {
            const parsedObject = JSON.parse(input);
            if (!Array.isArray(parsedObject)) {
                console.error('Parse error: `routerRules` in ServiceWorkerVersion should be an array');
                return null;
            }
            const routerRules = [];
            for (const parsedRule of parsedObject) {
                const { condition, source, id } = parsedRule;
                if (condition === undefined || source === undefined || id === undefined) {
                    console.error('Parse error: Missing some fields of `routerRules` in ServiceWorkerVersion');
                    return null;
                }
                routerRules.push(new ServiceWorkerRouterRule(JSON.stringify(condition), JSON.stringify(source), id));
            }
            return routerRules;
        }
        catch {
            console.error('Parse error: Invalid `routerRules` in ServiceWorkerVersion');
            return null;
        }
    }
    /**
     * `urlPattern` can be either plain text (e.g. '/foo/*') or a JSON-serialized URLPattern/URLPatternInit object.
     * Parses it to an object if valid JSON, otherwise falls back to the original string.
     */
    parseURLPatternCondition(urlPattern) {
        try {
            const parsed = JSON.parse(urlPattern);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                // URLPattern or URLPatternInit
                return parsed;
            }
            if (typeof parsed !== 'string') {
                return null;
            }
        }
        catch {
            // fallthrough
        }
        return urlPattern;
    }
    parseTypedRules(rules) {
        const routerRules = [];
        for (const rule of rules) {
            const condition = { ...rule.condition };
            // "urlPattern" condition can have structural URLPatternInit encoded into a JSON string.
            // If `condition` is directly stringified, such JSON strings are double-escaped (`"abc"` -> `\"abc\""`).
            // Expand "urlPattern" condition to native object and stringify whole conditions in such cases to avoid this.
            if (rule.condition.urlPattern) {
                condition.urlPattern = this.parseURLPatternCondition(rule.condition.urlPattern);
                if (condition.urlPattern === null) {
                    console.error('Parse error: Invalid "urlPattern" condition in `typedRouterRules` in ServiceWorkerVersion');
                    return null;
                }
            }
            let source;
            if (rule.source.type === "sourceDict" /* Protocol.ServiceWorker.ServiceWorkerRouterSourceType.SourceDict */) {
                if (!rule.source.sourceDict) {
                    console.error('Parse error: `sourceDict` is missing in `typedRouterRules` source');
                    return null;
                }
                source = rule.source.sourceDict;
            }
            else {
                if (rule.source.sourceDict !== undefined) {
                    console.error('Parse error: Unexpected `sourceDict` in `typedRouterRules` source');
                    return null;
                }
                source = rule.source.type;
            }
            routerRules.push(new ServiceWorkerRouterRule(JSON.stringify(condition), JSON.stringify(source), rule.id));
        }
        return routerRules;
    }
}
(function (ServiceWorkerVersion) {
    ServiceWorkerVersion.RunningStatus = {
        ["running" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Running */]: i18nLazyString(UIStrings.running),
        ["starting" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Starting */]: i18nLazyString(UIStrings.starting),
        ["stopped" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopped */]: i18nLazyString(UIStrings.stopped),
        ["stopping" /* Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopping */]: i18nLazyString(UIStrings.stopping),
    };
    ServiceWorkerVersion.Status = {
        ["activated" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Activated */]: i18nLazyString(UIStrings.activated),
        ["activating" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Activating */]: i18nLazyString(UIStrings.activating),
        ["installed" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Installed */]: i18nLazyString(UIStrings.installed),
        ["installing" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Installing */]: i18nLazyString(UIStrings.installing),
        ["new" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.New */]: i18nLazyString(UIStrings.new),
        ["redundant" /* Protocol.ServiceWorker.ServiceWorkerVersionStatus.Redundant */]: i18nLazyString(UIStrings.redundant),
    };
    let Modes;
    (function (Modes) {
        Modes["INSTALLING"] = "installing";
        Modes["WAITING"] = "waiting";
        Modes["ACTIVE"] = "active";
        Modes["REDUNDANT"] = "redundant";
    })(Modes = ServiceWorkerVersion.Modes || (ServiceWorkerVersion.Modes = {}));
})(ServiceWorkerVersion || (ServiceWorkerVersion = {}));
export class ServiceWorkerRegistration {
    #fingerprint;
    id;
    scopeURL;
    securityOrigin;
    isDeleted;
    versions = new Map();
    deleting = false;
    errors = [];
    constructor(payload) {
        this.update(payload);
    }
    update(payload) {
        this.#fingerprint = Symbol('fingerprint');
        this.id = payload.registrationId;
        this.scopeURL = payload.scopeURL;
        const parsedURL = new Common.ParsedURL.ParsedURL(payload.scopeURL);
        this.securityOrigin = parsedURL.securityOrigin();
        this.isDeleted = payload.isDeleted;
    }
    fingerprint() {
        return this.#fingerprint;
    }
    versionsByMode() {
        const result = new Map();
        for (const version of this.versions.values()) {
            result.set(version.mode(), version);
        }
        return result;
    }
    updateVersion(payload) {
        this.#fingerprint = Symbol('fingerprint');
        let version = this.versions.get(payload.versionId);
        if (!version) {
            version = new ServiceWorkerVersion(this, payload);
            this.versions.set(payload.versionId, version);
            return version;
        }
        version.update(payload);
        return version;
    }
    isRedundant() {
        for (const version of this.versions.values()) {
            if (!version.isStoppedAndRedundant()) {
                return false;
            }
        }
        return true;
    }
    shouldBeRemoved() {
        return this.isRedundant() && (!this.errors.length || this.deleting);
    }
    canBeRemoved() {
        return this.isDeleted || this.deleting;
    }
}
class ServiceWorkerContextNamer {
    #target;
    #serviceWorkerManager;
    #versionByTargetId = new Map();
    constructor(target, serviceWorkerManager) {
        this.#target = target;
        this.#serviceWorkerManager = serviceWorkerManager;
        serviceWorkerManager.addEventListener("RegistrationUpdated" /* Events.REGISTRATION_UPDATED */, this.registrationsUpdated, this);
        serviceWorkerManager.addEventListener("RegistrationDeleted" /* Events.REGISTRATION_DELETED */, this.registrationsUpdated, this);
        this.#target.targetManager().addModelListener(RuntimeModel, RuntimeModelEvents.ExecutionContextCreated, this.executionContextCreated, this);
    }
    registrationsUpdated() {
        this.#versionByTargetId.clear();
        const registrations = this.#serviceWorkerManager.registrations().values();
        for (const registration of registrations) {
            for (const version of registration.versions.values()) {
                if (version.targetId) {
                    this.#versionByTargetId.set(version.targetId, version);
                }
            }
        }
        this.updateAllContextLabels();
    }
    executionContextCreated(event) {
        const executionContext = event.data;
        const serviceWorkerTargetId = this.serviceWorkerTargetId(executionContext.target());
        if (!serviceWorkerTargetId) {
            return;
        }
        this.updateContextLabel(executionContext, this.#versionByTargetId.get(serviceWorkerTargetId) || null);
    }
    serviceWorkerTargetId(target) {
        if (target.parentTarget() !== this.#target || target.type() !== Type.ServiceWorker) {
            return null;
        }
        return target.id();
    }
    updateAllContextLabels() {
        for (const target of this.#target.targetManager().targets()) {
            const serviceWorkerTargetId = this.serviceWorkerTargetId(target);
            if (!serviceWorkerTargetId) {
                continue;
            }
            const version = this.#versionByTargetId.get(serviceWorkerTargetId) || null;
            const runtimeModel = target.model(RuntimeModel);
            const executionContexts = runtimeModel ? runtimeModel.executionContexts() : [];
            for (const context of executionContexts) {
                this.updateContextLabel(context, version);
            }
        }
    }
    updateContextLabel(context, version) {
        if (!version) {
            context.setLabel('');
            return;
        }
        const parsedUrl = Common.ParsedURL.ParsedURL.fromString(context.origin);
        const label = parsedUrl ? parsedUrl.lastPathComponentWithFragment() : context.name;
        const localizedStatus = ServiceWorkerVersion.Status[version.status];
        context.setLabel(i18nString(UIStrings.sSS, { PH1: label, PH2: version.id, PH3: localizedStatus() }));
    }
}
SDKModel.register(ServiceWorkerManager, { capabilities: 16384 /* Capability.SERVICE_WORKER */, autostart: true });
//# sourceMappingURL=ServiceWorkerManager.js.map