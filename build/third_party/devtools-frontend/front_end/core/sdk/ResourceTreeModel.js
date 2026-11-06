// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import { DOMModel } from './DOMModel.js';
import { Events as NetworkManagerEvents, NetworkManager } from './NetworkManager.js';
import { Resource } from './Resource.js';
import { ExecutionContext, RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { SecurityOrigin } from './SecurityOrigin.js';
import { SecurityOriginManager } from './SecurityOriginManager.js';
import { StorageKeyManager } from './StorageKeyManager.js';
import { Type } from './Target.js';
export class ResourceTreeModel extends SDKModel {
    agent;
    storageAgent;
    #securityOriginManager;
    #storageKeyManager;
    #frameManager;
    framesInternal = new Map();
    #cachedResourcesProcessed = false;
    #pendingReloadOptions = null;
    #reloadSuspensionCount = 0;
    isInterstitialShowing = false;
    mainFrame = null;
    #pendingBackForwardCacheNotUsedEvents = new Set();
    constructor(target) {
        super(target);
        this.#frameManager = target.targetManager().getFrameManager();
        const networkManager = target.model(NetworkManager);
        if (networkManager) {
            networkManager.addEventListener(NetworkManagerEvents.RequestFinished, this.onRequestFinished, this);
            networkManager.addEventListener(NetworkManagerEvents.RequestUpdateDropped, this.onRequestUpdateDropped, this);
        }
        this.agent = target.pageAgent();
        this.storageAgent = target.storageAgent();
        void this.agent.invoke_enable({});
        this.#securityOriginManager = target.model(SecurityOriginManager);
        this.#storageKeyManager = target.model(StorageKeyManager);
        target.registerPageDispatcher(new PageDispatcher(this));
        void this.#buildResourceTree();
    }
    async #buildResourceTree() {
        return await this.agent.invoke_getResourceTree().then(event => {
            this.processCachedResources(event.getError() ? null : event.frameTree);
            if (this.mainFrame) {
                this.processPendingEvents(this.mainFrame);
            }
        });
    }
    static frameForRequest(request) {
        const networkManager = NetworkManager.forRequest(request);
        const resourceTreeModel = networkManager ? networkManager.target().model(ResourceTreeModel) : null;
        if (!resourceTreeModel) {
            return null;
        }
        return request.frameId ? resourceTreeModel.frameForId(request.frameId) : null;
    }
    static frames(targetManager) {
        const result = [];
        for (const resourceTreeModel of targetManager.models(ResourceTreeModel)) {
            result.push(...resourceTreeModel.frames());
        }
        return result;
    }
    /**
     * Finds the first active frame that matches the specified security origin under
     * the given primary page target.
     *
     * Returns `null` if the target has no outermost target or if no matching frame
     * exists.
     *
     * @param primaryPageTarget The primary page target that contains the candidate frames.
     * @param origin The security origin to match.
     * @returns The first matching frame, or `null` if no frame matches.
     */
    static frameForOrigin(primaryPageTarget, origin) {
        const outermostTarget = primaryPageTarget.outermostTarget();
        if (!outermostTarget) {
            return null;
        }
        for (const frame of ResourceTreeModel.frames(primaryPageTarget.targetManager())) {
            if (frame.resourceTreeModel().target().outermostTarget() !== outermostTarget) {
                continue;
            }
            if (frame.securityOrigin().isSameOriginWith(origin)) {
                return frame;
            }
        }
        return null;
    }
    static resourceForURL(targetManager, url) {
        for (const resourceTreeModel of targetManager.models(ResourceTreeModel)) {
            const mainFrame = resourceTreeModel.mainFrame;
            // Workers call into this with no #frames available.
            const result = mainFrame ? mainFrame.resourceForURL(url) : null;
            if (result) {
                return result;
            }
        }
        return null;
    }
    static reloadAllPages(targetManager, bypassCache, scriptToEvaluateOnLoad) {
        for (const resourceTreeModel of targetManager.models(ResourceTreeModel)) {
            if (resourceTreeModel.target().parentTarget()?.type() !== Type.FRAME) {
                resourceTreeModel.reloadPage(bypassCache, scriptToEvaluateOnLoad);
            }
        }
    }
    async storageKeyForFrame(frameId) {
        if (!this.framesInternal.has(frameId)) {
            return null;
        }
        const response = await this.storageAgent.invoke_getStorageKey({ frameId });
        if (response.getError() === 'Frame tree node for given frame not found') {
            return null;
        }
        return response.storageKey;
    }
    domModel() {
        return this.target().model(DOMModel);
    }
    processCachedResources(mainFramePayload) {
        // TODO(caseq): the url check below is a mergeable, conservative
        // workaround for a problem caused by us requesting resources from a
        // subtarget frame before it has committed. The proper fix is likely
        // to be too complicated to be safely merged.
        // See https://crbug.com/1081270 for details.
        if (mainFramePayload && mainFramePayload.frame.url !== ':') {
            this.dispatchEventToListeners(Events.WillLoadCachedResources);
            this.addFramesRecursively(null, mainFramePayload);
            this.target().setInspectedURL(mainFramePayload.frame.url);
        }
        this.#cachedResourcesProcessed = true;
        const runtimeModel = this.target().model(RuntimeModel);
        if (runtimeModel) {
            runtimeModel.setExecutionContextComparator(this.executionContextComparator.bind(this));
            runtimeModel.fireExecutionContextOrderChanged();
        }
        this.dispatchEventToListeners(Events.CachedResourcesLoaded, this);
    }
    cachedResourcesLoaded() {
        return this.#cachedResourcesProcessed;
    }
    addFrame(frame, _aboutToNavigate) {
        this.framesInternal.set(frame.id, frame);
        if (frame.isMainFrame()) {
            this.mainFrame = frame;
        }
        this.dispatchEventToListeners(Events.FrameAdded, frame);
        this.updateSecurityOrigins();
        void this.updateStorageKeys();
    }
    frameAttached(frameId, parentFrameId, stackTrace) {
        const sameTargetParentFrame = parentFrameId ? (this.framesInternal.get(parentFrameId) || null) : null;
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this.#cachedResourcesProcessed && sameTargetParentFrame) {
            return null;
        }
        if (this.framesInternal.has(frameId)) {
            return null;
        }
        const frame = new ResourceTreeFrame(this, sameTargetParentFrame, frameId, null, stackTrace || null);
        if (parentFrameId && !sameTargetParentFrame) {
            frame.crossTargetParentFrameId = parentFrameId;
        }
        if (frame.isMainFrame() && this.mainFrame) {
            // Navigation to the new backend process.
            this.frameDetached(this.mainFrame.id, false);
        }
        this.addFrame(frame, true);
        return frame;
    }
    frameNavigated(framePayload, type) {
        this.#frameNavigated(framePayload, type, /* isDocumentOpened */ false);
    }
    #frameNavigated(framePayload, type, isDocumentOpened) {
        const sameTargetParentFrame = framePayload.parentId ? (this.framesInternal.get(framePayload.parentId) || null) : null;
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this.#cachedResourcesProcessed && sameTargetParentFrame) {
            return;
        }
        let frame = this.framesInternal.get(framePayload.id) || null;
        if (!frame) {
            // Simulate missed "frameAttached" for a main frame navigation to the new backend process.
            frame = this.frameAttached(framePayload.id, framePayload.parentId || null);
            console.assert(Boolean(frame));
            if (!frame) {
                return;
            }
        }
        this.dispatchEventToListeners(Events.FrameWillNavigate, frame);
        frame.navigate(framePayload);
        if (type) {
            frame.backForwardCacheDetails.restoredFromCache = type === "BackForwardCacheRestore" /* Protocol.Page.NavigationType.BackForwardCacheRestore */;
        }
        if (frame.isMainFrame()) {
            this.target().setInspectedURL(frame.url);
        }
        this.dispatchEventToListeners(Events.FrameNavigated, frame);
        if (frame.isPrimaryFrame()) {
            this.primaryPageChanged(frame, "Navigation" /* PrimaryPageChangeType.NAVIGATION */);
        }
        // Fill frame with retained resources (the ones loaded using new loader).
        const resources = frame.resources();
        for (let i = 0; i < resources.length; ++i) {
            this.dispatchEventToListeners(Events.ResourceAdded, resources[i]);
        }
        // The document resource is normally added once the Network domain reports
        // the document request as finished. Clients that run without the Network
        // domain never get it, so inline scripts and styles can't be mapped to the
        // document. Unless the request is still in flight, add the document
        // resource right away, like `addFramesRecursively()` does for loaded frames.
        // Documents created by `document.open()` have no request of their own and
        // their content is not available.
        const networkManager = this.target().model(NetworkManager);
        if (!frame.getResourcesMap().get(framePayload.url) &&
            (isDocumentOpened || !networkManager?.requestForLoaderId(framePayload.loaderId))) {
            const frameResource = this.createResourceFromFramePayload(framePayload, framePayload.url, Common.ResourceType.resourceTypes.Document, framePayload.mimeType, null, null);
            frameResource.isGenerated = isDocumentOpened;
            frame.addResource(frameResource);
        }
        this.updateSecurityOrigins();
        void this.updateStorageKeys();
        if (frame.backForwardCacheDetails.restoredFromCache) {
            this.#frameManager.modelRemoved(this);
            this.#frameManager.modelAdded(this);
            void this.#buildResourceTree();
        }
    }
    primaryPageChanged(frame, type) {
        this.processPendingEvents(frame);
        this.dispatchEventToListeners(Events.PrimaryPageChanged, { frame, type });
        const networkManager = this.target().model(NetworkManager);
        if (networkManager && frame.isOutermostFrame()) {
            networkManager.clearRequests();
        }
    }
    documentOpened(framePayload) {
        this.#frameNavigated(framePayload, undefined, /* isDocumentOpened */ true);
        const frame = this.framesInternal.get(framePayload.id);
        if (frame) {
            this.dispatchEventToListeners(Events.DocumentOpened, frame);
        }
    }
    navigatedWithinDocument(frameId, url) {
        const frame = this.framesInternal.get(frameId);
        if (!frame) {
            return;
        }
        frame.navigatedWithinDocument(url);
        if (frame.isMainFrame()) {
            this.target().setInspectedURL(frame.url);
        }
        this.dispatchEventToListeners(Events.FrameNavigatedWithinDocument, frame);
    }
    frameStoppedLoading(frameId) {
        const frame = this.framesInternal.get(frameId);
        if (!frame) {
            return;
        }
        // The renderer sends `Page.frameNavigated` before it tells the browser
        // process about the commit, so the `Storage.getStorageKey` request issued
        // from `ResourceTreeFrame.navigate()` may be answered for the previous
        // document (and fails outright if that document had an opaque origin, e.g.
        // the initial about:blank). `Page.frameStoppedLoading` comes from the
        // browser process after the commit, so re-fetch the storage key here.
        void frame.getStorageKey(/* forceFetch */ true);
        void this.updateStorageKeys();
    }
    frameDetached(frameId, isSwap) {
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this.#cachedResourcesProcessed) {
            return;
        }
        const frame = this.framesInternal.get(frameId);
        if (!frame) {
            return;
        }
        const sameTargetParentFrame = frame.sameTargetParentFrame();
        if (sameTargetParentFrame) {
            sameTargetParentFrame.removeChildFrame(frame, isSwap);
        }
        else {
            frame.remove(isSwap);
        }
        this.updateSecurityOrigins();
        void this.updateStorageKeys();
    }
    onRequestFinished(event) {
        if (!this.#cachedResourcesProcessed) {
            return;
        }
        const request = event.data;
        if (request.failed) {
            return;
        }
        const frame = request.frameId ? this.framesInternal.get(request.frameId) : null;
        if (frame) {
            frame.addRequest(request);
        }
    }
    onRequestUpdateDropped(event) {
        if (!this.#cachedResourcesProcessed) {
            return;
        }
        const data = event.data;
        const frameId = data.frameId;
        if (!frameId) {
            return;
        }
        const frame = this.framesInternal.get(frameId);
        if (!frame) {
            return;
        }
        const url = data.url;
        if (frame.getResourcesMap().get(url)) {
            return;
        }
        const resource = new Resource(this, null, url, frame.url, frameId, data.loaderId, Common.ResourceType.resourceTypes[data.resourceType], data.mimeType, data.lastModified, null);
        frame.addResource(resource);
    }
    frameForId(frameId) {
        return this.framesInternal.get(frameId) || null;
    }
    forAllResources(callback) {
        if (this.mainFrame) {
            return this.mainFrame.callForFrameResources(callback);
        }
        return false;
    }
    frames() {
        return [...this.framesInternal.values()];
    }
    addFramesRecursively(sameTargetParentFrame, frameTreePayload) {
        const framePayload = frameTreePayload.frame;
        let frame = this.framesInternal.get(framePayload.id);
        if (!frame) {
            frame = new ResourceTreeFrame(this, sameTargetParentFrame, framePayload.id, framePayload, null);
        }
        if (!sameTargetParentFrame && framePayload.parentId) {
            frame.crossTargetParentFrameId = framePayload.parentId;
        }
        this.addFrame(frame);
        for (const childFrame of frameTreePayload.childFrames || []) {
            this.addFramesRecursively(frame, childFrame);
        }
        for (let i = 0; i < frameTreePayload.resources.length; ++i) {
            const subresource = frameTreePayload.resources[i];
            const resource = this.createResourceFromFramePayload(framePayload, subresource.url, Common.ResourceType.resourceTypes[subresource.type], subresource.mimeType, subresource.lastModified || null, subresource.contentSize || null);
            frame.addResource(resource);
        }
        if (!frame.getResourcesMap().get(framePayload.url)) {
            const frameResource = this.createResourceFromFramePayload(framePayload, framePayload.url, Common.ResourceType.resourceTypes.Document, framePayload.mimeType, null, null);
            frame.addResource(frameResource);
        }
    }
    createResourceFromFramePayload(frame, url, type, mimeType, lastModifiedTime, contentSize) {
        const lastModified = typeof lastModifiedTime === 'number' ? new Date(lastModifiedTime * 1000) : null;
        return new Resource(this, null, url, frame.url, frame.id, frame.loaderId, type, mimeType, lastModified, contentSize);
    }
    suspendReload() {
        this.#reloadSuspensionCount++;
    }
    resumeReload() {
        this.#reloadSuspensionCount--;
        console.assert(this.#reloadSuspensionCount >= 0, 'Unbalanced call to ResourceTreeModel.resumeReload()');
        if (!this.#reloadSuspensionCount && this.#pendingReloadOptions) {
            const { ignoreCache, scriptToEvaluateOnLoad, loaderId } = this.#pendingReloadOptions;
            // A deferred reload (and its scriptToEvaluateOnLoad) only applies to the
            // document it was requested against. If the main frame has since
            // navigated to another document, drop the stale request instead of
            // replaying it against the new document.
            if (loaderId !== this.mainFrame?.loaderId) {
                this.#pendingReloadOptions = null;
                return;
            }
            this.reloadPage(ignoreCache, scriptToEvaluateOnLoad);
        }
    }
    reloadPage(ignoreCache, scriptToEvaluateOnLoad) {
        const loaderId = this.mainFrame?.loaderId;
        if (!loaderId) {
            return;
        }
        // Only dispatch PageReloadRequested upon first reload request to simplify client logic.
        if (!this.#pendingReloadOptions) {
            this.dispatchEventToListeners(Events.PageReloadRequested, this);
        }
        if (this.#reloadSuspensionCount) {
            this.#pendingReloadOptions = { ignoreCache, scriptToEvaluateOnLoad, loaderId };
            return;
        }
        this.#pendingReloadOptions = null;
        const networkManager = this.target().model(NetworkManager);
        if (networkManager) {
            networkManager.clearRequests();
        }
        this.dispatchEventToListeners(Events.WillReloadPage);
        void this.agent.invoke_reload({ ignoreCache, scriptToEvaluateOnLoad, loaderId });
    }
    navigate(url) {
        return this.agent.invoke_navigate({ url });
    }
    async navigationHistory() {
        const response = await this.agent.invoke_getNavigationHistory();
        if (response.getError()) {
            return null;
        }
        return { currentIndex: response.currentIndex, entries: response.entries };
    }
    navigateToHistoryEntry(entry) {
        void this.agent.invoke_navigateToHistoryEntry({ entryId: entry.id });
    }
    setLifecycleEventsEnabled(enabled) {
        return this.agent.invoke_setLifecycleEventsEnabled({ enabled });
    }
    async fetchAppManifest() {
        const response = await this.agent.invoke_getAppManifest({});
        if (response.getError()) {
            return { url: response.url, data: null, errors: [] };
        }
        return { url: response.url, data: response.data || null, errors: response.errors };
    }
    async getInstallabilityErrors() {
        const response = await this.agent.invoke_getInstallabilityErrors();
        return response.installabilityErrors || [];
    }
    async getAppId() {
        return await this.agent.invoke_getAppId();
    }
    executionContextComparator(a, b) {
        function framePath(frame) {
            let currentFrame = frame;
            const parents = [];
            while (currentFrame) {
                parents.push(currentFrame);
                currentFrame = currentFrame.sameTargetParentFrame();
            }
            return parents.reverse();
        }
        if (a.target() !== b.target()) {
            return ExecutionContext.comparator(a, b);
        }
        const framesA = a.frameId ? framePath(this.frameForId(a.frameId)) : [];
        const framesB = b.frameId ? framePath(this.frameForId(b.frameId)) : [];
        let frameA;
        let frameB;
        for (let i = 0;; i++) {
            if (!framesA[i] || !framesB[i] || (framesA[i] !== framesB[i])) {
                frameA = framesA[i];
                frameB = framesB[i];
                break;
            }
        }
        if (!frameA && frameB) {
            return -1;
        }
        if (!frameB && frameA) {
            return 1;
        }
        if (frameA && frameB) {
            return frameA.id.localeCompare(frameB.id);
        }
        return ExecutionContext.comparator(a, b);
    }
    getSecurityOriginData() {
        const securityOrigins = [];
        let mainSecurityOrigin = null;
        let unreachableMainSecurityOrigin = null;
        for (const frame of this.framesInternal.values()) {
            const origin = frame.securityOrigin();
            if (frame.isMainFrame()) {
                mainSecurityOrigin = origin.isOpaque() ? null : origin;
                if (frame.unreachableUrl()) {
                    const unreachable = SecurityOrigin.create(frame.unreachableUrl());
                    unreachableMainSecurityOrigin = unreachable.isOpaque() ? null : unreachable;
                }
            }
            if (origin.isOpaque()) {
                continue;
            }
            if (!securityOrigins.some(existing => existing.isSameOriginWith(origin))) {
                securityOrigins.push(origin);
            }
        }
        return {
            securityOrigins,
            mainSecurityOrigin,
            unreachableMainSecurityOrigin,
        };
    }
    async getStorageKeyData() {
        const storageKeys = new Set();
        let mainStorageKey = null;
        for (const { isMainFrame, storageKey } of await Promise.all([...this.framesInternal.values()].map(f => f.getStorageKey(/* forceFetch */ false).then(k => ({
            isMainFrame: f.isMainFrame(),
            storageKey: k,
        }))))) {
            if (isMainFrame) {
                mainStorageKey = storageKey;
            }
            if (storageKey) {
                storageKeys.add(storageKey);
            }
        }
        return { storageKeys, mainStorageKey };
    }
    updateSecurityOrigins() {
        const data = this.getSecurityOriginData();
        // TODO(crbug.com/559122726): SecurityOriginManager currently expects string identifiers.
        // Update SecurityOriginManager to store and emit SecurityOrigin objects directly so
        // that the siteId() conversions below can be removed.
        this.#securityOriginManager.setMainSecurityOrigin(data.mainSecurityOrigin?.siteId() || '', data.unreachableMainSecurityOrigin?.siteId() || '');
        this.#securityOriginManager.updateSecurityOrigins(new Set(data.securityOrigins.map(o => o.siteId())));
    }
    async updateStorageKeys() {
        const data = await this.getStorageKeyData();
        this.#storageKeyManager.setMainStorageKey(data.mainStorageKey || '');
        this.#storageKeyManager.updateStorageKeys(data.storageKeys);
    }
    async getMainStorageKey() {
        return this.mainFrame ? await this.mainFrame.getStorageKey(/* forceFetch */ false) : null;
    }
    // TODO(crbug.com/559122726): Remove siteId() usage and evaluate removing this method in favor of direct SecurityOrigin handling.
    getMainSecurityOrigin() {
        const data = this.getSecurityOriginData();
        return data.mainSecurityOrigin?.siteId() || data.unreachableMainSecurityOrigin?.siteId() || null;
    }
    onBackForwardCacheNotUsed(event) {
        if (this.mainFrame && this.mainFrame.id === event.frameId && this.mainFrame.loaderId === event.loaderId) {
            this.mainFrame.setBackForwardCacheDetails(event);
            this.dispatchEventToListeners(Events.BackForwardCacheDetailsUpdated, this.mainFrame);
        }
        else {
            this.#pendingBackForwardCacheNotUsedEvents.add(event);
        }
    }
    processPendingEvents(frame) {
        if (!frame.isMainFrame()) {
            return;
        }
        for (const event of this.#pendingBackForwardCacheNotUsedEvents) {
            if (frame.id === event.frameId && frame.loaderId === event.loaderId) {
                frame.setBackForwardCacheDetails(event);
                this.#pendingBackForwardCacheNotUsedEvents.delete(event);
                break;
            }
        }
        // No need to dispatch events here as this method call is followed by a `PrimaryPageChanged` event.
    }
}
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["FrameAdded"] = "FrameAdded";
    Events["FrameNavigated"] = "FrameNavigated";
    Events["FrameNavigatedWithinDocument"] = "FrameNavigatedWithinDocument";
    Events["FrameDetached"] = "FrameDetached";
    Events["FrameResized"] = "FrameResized";
    Events["FrameWillNavigate"] = "FrameWillNavigate";
    Events["DocumentOpened"] = "DocumentOpened";
    Events["PrimaryPageChanged"] = "PrimaryPageChanged";
    Events["ResourceAdded"] = "ResourceAdded";
    Events["WillLoadCachedResources"] = "WillLoadCachedResources";
    Events["CachedResourcesLoaded"] = "CachedResourcesLoaded";
    Events["DOMContentLoaded"] = "DOMContentLoaded";
    Events["LifecycleEvent"] = "LifecycleEvent";
    Events["Load"] = "Load";
    Events["PageReloadRequested"] = "PageReloadRequested";
    Events["WillReloadPage"] = "WillReloadPage";
    Events["InterstitialShown"] = "InterstitialShown";
    Events["InterstitialHidden"] = "InterstitialHidden";
    Events["BackForwardCacheDetailsUpdated"] = "BackForwardCacheDetailsUpdated";
    Events["JavaScriptDialogOpening"] = "JavaScriptDialogOpening";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
export class ResourceTreeFrame {
    #model;
    #sameTargetParentFrame;
    #id;
    crossTargetParentFrameId = null;
    #loaderId;
    #name;
    #url;
    #domainAndRegistry;
    #securityOrigin;
    #securityOriginDetails;
    #storageKey;
    #unreachableUrl;
    #adFrameStatus;
    #secureContextType;
    #crossOriginIsolatedContextType;
    #gatedAPIFeatures;
    #creationStackTrace;
    #creationStackTraceTarget = null;
    #childFrames = new Set();
    resourcesMap = new Map();
    backForwardCacheDetails = {
        explanations: [],
    };
    constructor(model, parentFrame, frameId, payload, creationStackTrace) {
        this.#model = model;
        this.#sameTargetParentFrame = parentFrame;
        this.#id = frameId;
        this.#loaderId = payload?.loaderId ?? '';
        this.#name = payload?.name;
        this.#url = payload && payload.url || Platform.DevToolsPath.EmptyUrlString;
        this.#domainAndRegistry = (payload?.domainAndRegistry) || '';
        this.#securityOrigin = SecurityOrigin.create(payload?.securityOrigin ?? '');
        this.#securityOriginDetails = payload?.securityOriginDetails;
        this.#unreachableUrl =
            (payload && payload.unreachableUrl) || Platform.DevToolsPath.EmptyUrlString;
        this.#adFrameStatus = payload?.adFrameStatus;
        this.#secureContextType = payload?.secureContextType ?? null;
        this.#crossOriginIsolatedContextType = payload?.crossOriginIsolatedContextType ?? null;
        this.#gatedAPIFeatures = payload?.gatedAPIFeatures ?? null;
        this.#creationStackTrace = creationStackTrace;
        if (this.#sameTargetParentFrame) {
            this.#sameTargetParentFrame.#childFrames.add(this);
        }
    }
    isSecureContext() {
        return this.#secureContextType !== null && this.#secureContextType.startsWith('Secure');
    }
    getSecureContextType() {
        return this.#secureContextType;
    }
    isCrossOriginIsolated() {
        return this.#crossOriginIsolatedContextType !== null && this.#crossOriginIsolatedContextType.startsWith('Isolated');
    }
    getCrossOriginIsolatedContextType() {
        return this.#crossOriginIsolatedContextType;
    }
    getGatedAPIFeatures() {
        return this.#gatedAPIFeatures;
    }
    getCreationStackTraceData() {
        return {
            creationStackTrace: this.#creationStackTrace,
            creationStackTraceTarget: this.#creationStackTraceTarget || this.resourceTreeModel().target(),
        };
    }
    navigate(framePayload) {
        this.#loaderId = framePayload.loaderId;
        this.#name = framePayload.name;
        this.#url = framePayload.url;
        this.#domainAndRegistry = framePayload.domainAndRegistry;
        this.#securityOrigin = SecurityOrigin.create(framePayload.securityOrigin);
        this.#securityOriginDetails = framePayload.securityOriginDetails;
        void this.getStorageKey(/* forceFetch */ true);
        this.#unreachableUrl =
            framePayload.unreachableUrl || Platform.DevToolsPath.EmptyUrlString;
        this.#adFrameStatus = framePayload?.adFrameStatus;
        this.#secureContextType = framePayload.secureContextType;
        this.#crossOriginIsolatedContextType = framePayload.crossOriginIsolatedContextType;
        this.#gatedAPIFeatures = framePayload.gatedAPIFeatures;
        this.backForwardCacheDetails = {
            explanations: [],
        };
        const mainResource = this.resourcesMap.get(this.#url);
        this.resourcesMap.clear();
        this.removeChildFrames();
        if (mainResource && mainResource.loaderId === this.#loaderId) {
            this.addResource(mainResource);
        }
    }
    navigatedWithinDocument(url) {
        this.#url = url;
    }
    resourceTreeModel() {
        return this.#model;
    }
    get id() {
        return this.#id;
    }
    get name() {
        return this.#name || '';
    }
    get url() {
        return this.#url;
    }
    domainAndRegistry() {
        return this.#domainAndRegistry;
    }
    async getAdScriptAncestry(frameId) {
        const res = await this.#model.agent.invoke_getAdScriptAncestry({ frameId });
        return res.adScriptAncestry || null;
    }
    /**
     * Returns the security origin of this frame.
     *
     * If the frame does not have a valid origin (such as `about:blank`), this
     * method returns a unique opaque origin.
     *
     * @returns The security origin of the frame.
     */
    securityOrigin() {
        return this.#securityOrigin;
    }
    get securityOriginDetails() {
        return this.#securityOriginDetails ?? null;
    }
    getStorageKey(forceFetch) {
        if (!this.#storageKey || forceFetch) {
            this.#storageKey = this.#model.storageKeyForFrame(this.#id);
        }
        return this.#storageKey;
    }
    unreachableUrl() {
        return this.#unreachableUrl;
    }
    get loaderId() {
        return this.#loaderId;
    }
    adFrameType() {
        return this.#adFrameStatus?.adFrameType || "none" /* Protocol.Page.AdFrameType.None */;
    }
    adFrameStatus() {
        return this.#adFrameStatus;
    }
    get childFrames() {
        return [...this.#childFrames];
    }
    /**
     * Returns the parent frame if both #frames are part of the same process/target.
     */
    sameTargetParentFrame() {
        return this.#sameTargetParentFrame;
    }
    /**
     * Returns the parent frame if both #frames are part of different processes/targets (child is an OOPIF).
     */
    crossTargetParentFrame() {
        if (!this.crossTargetParentFrameId) {
            return null;
        }
        const parentTarget = this.#model.target().parentTarget();
        if (parentTarget?.type() !== Type.FRAME) {
            return null;
        }
        const parentModel = parentTarget.model(ResourceTreeModel);
        if (!parentModel) {
            return null;
        }
        // Note that parent #model has already processed cached resources:
        // - when parent target was created, we issued getResourceTree call;
        // - strictly after we issued setAutoAttach call;
        // - both of them were handled in renderer in the same order;
        // - cached resource tree got processed on parent #model;
        // - child target was created as a result of setAutoAttach call.
        return parentModel.framesInternal.get(this.crossTargetParentFrameId) || null;
    }
    /**
     * Returns the parent frame. There is only 1 parent and it's either in the
     * same target or it's cross-target.
     */
    parentFrame() {
        return this.sameTargetParentFrame() || this.crossTargetParentFrame();
    }
    /**
     * Returns true if this is the main frame of its target. A main frame is the root of the frame tree i.e. a frame without
     * a parent, but the whole frame tree could be embedded in another frame tree (e.g. OOPIFs, fenced frames, portals).
     * https://chromium.googlesource.com/chromium/src/+/HEAD/docs/frame_trees.md
     */
    isMainFrame() {
        return !this.#sameTargetParentFrame;
    }
    /**
     * Returns true if this is a main frame which is not embedded in another frame tree. With MPArch features such as
     * back/forward cache or prerender there can be multiple outermost frames.
     * https://chromium.googlesource.com/chromium/src/+/HEAD/docs/frame_trees.md
     */
    isOutermostFrame() {
        return this.#model.target().parentTarget()?.type() !== Type.FRAME && !this.#sameTargetParentFrame &&
            !this.crossTargetParentFrameId;
    }
    /**
     * Returns true if this is the primary frame of the browser tab. There can only be one primary frame for each
     * browser tab. It is the outermost frame being actively displayed in the browser tab.
     * https://chromium.googlesource.com/chromium/src/+/HEAD/docs/frame_trees.md
     */
    isPrimaryFrame() {
        return !this.#sameTargetParentFrame &&
            this.#model.target() === this.#model.target().targetManager().primaryPageTarget();
    }
    removeChildFrame(frame, isSwap) {
        this.#childFrames.delete(frame);
        frame.remove(isSwap);
    }
    removeChildFrames() {
        const frames = this.#childFrames;
        this.#childFrames = new Set();
        for (const frame of frames) {
            frame.remove(false);
        }
    }
    remove(isSwap) {
        this.removeChildFrames();
        this.#model.framesInternal.delete(this.id);
        this.#model.dispatchEventToListeners(Events.FrameDetached, { frame: this, isSwap });
    }
    addResource(resource) {
        if (this.resourcesMap.get(resource.url) === resource) {
            // Already in the tree, we just got an extra update.
            return;
        }
        this.resourcesMap.set(resource.url, resource);
        this.#model.dispatchEventToListeners(Events.ResourceAdded, resource);
    }
    addRequest(request) {
        let resource = this.resourcesMap.get(request.url());
        if (resource?.request === request) {
            // Already in the tree, we just got an extra update.
            return;
        }
        resource = new Resource(this.#model, request, request.url(), request.documentURL, request.frameId, request.loaderId, request.resourceType(), request.mimeType, null, null);
        this.resourcesMap.set(resource.url, resource);
        this.#model.dispatchEventToListeners(Events.ResourceAdded, resource);
    }
    resources() {
        return Array.from(this.resourcesMap.values());
    }
    resourceForURL(url) {
        const resource = this.resourcesMap.get(url);
        if (resource) {
            return resource;
        }
        for (const frame of this.#childFrames) {
            const resource = frame.resourceForURL(url);
            if (resource) {
                return resource;
            }
        }
        return null;
    }
    callForFrameResources(callback) {
        for (const resource of this.resourcesMap.values()) {
            if (callback(resource)) {
                return true;
            }
        }
        for (const frame of this.#childFrames) {
            if (frame.callForFrameResources(callback)) {
                return true;
            }
        }
        return false;
    }
    displayName() {
        if (this.isOutermostFrame()) {
            return i18n.i18n.lockedString('top');
        }
        const subtitle = new Common.ParsedURL.ParsedURL(this.#url).displayName;
        if (subtitle) {
            if (!this.#name) {
                return subtitle;
            }
            return this.#name + ' (' + subtitle + ')';
        }
        return i18n.i18n.lockedString('iframe');
    }
    async getOwnerDeferredDOMNode() {
        const parentFrame = this.parentFrame();
        if (!parentFrame) {
            return null;
        }
        return await parentFrame.resourceTreeModel().domModel().getOwnerNodeForFrame(this.#id);
    }
    async getOwnerDOMNodeOrDocument() {
        const deferredNode = await this.getOwnerDeferredDOMNode();
        if (deferredNode) {
            return await deferredNode.resolvePromise();
        }
        if (this.isOutermostFrame()) {
            return await this.resourceTreeModel().domModel().requestDocument();
        }
        return null;
    }
    async highlight() {
        const parentFrame = this.parentFrame();
        const parentTarget = this.resourceTreeModel().target().parentTarget();
        const highlightFrameOwner = async (domModel) => {
            const deferredNode = await domModel.getOwnerNodeForFrame(this.#id);
            if (deferredNode) {
                domModel.overlayModel().highlightInOverlay({ deferredNode, selectorList: '' }, 'all', true);
            }
        };
        if (parentFrame) {
            return await highlightFrameOwner(parentFrame.resourceTreeModel().domModel());
        }
        // Fenced frames.
        if (parentTarget?.type() === Type.FRAME) {
            const domModel = parentTarget.model(DOMModel);
            if (domModel) {
                return await highlightFrameOwner(domModel);
            }
        }
        // For the outermost frame there is no owner node. Highlight the whole #document instead.
        const document = await this.resourceTreeModel().domModel().requestDocument();
        if (document) {
            this.resourceTreeModel().domModel().overlayModel().highlightInOverlay({ node: document, selectorList: '' }, 'all', true);
        }
    }
    async getPermissionsPolicyState() {
        const response = await this.resourceTreeModel().target().pageAgent().invoke_getPermissionsPolicyState({ frameId: this.#id });
        if (response.getError()) {
            return null;
        }
        return response.states;
    }
    async getOriginTrials() {
        const response = await this.resourceTreeModel().target().pageAgent().invoke_getOriginTrials({ frameId: this.#id });
        if (response.getError()) {
            return [];
        }
        return response.originTrials;
    }
    async getSpellCheckCustomDictionary() {
        const response = await this.resourceTreeModel().target().pageAgent().invoke_getSpellCheckCustomDictionary({ frameId: this.#id });
        if (response.getError()) {
            return [];
        }
        return response.words;
    }
    setCreationStackTrace(creationStackTraceData) {
        this.#creationStackTrace = creationStackTraceData.creationStackTrace;
        this.#creationStackTraceTarget = creationStackTraceData.creationStackTraceTarget;
    }
    setBackForwardCacheDetails(event) {
        this.backForwardCacheDetails.restoredFromCache = false;
        this.backForwardCacheDetails.explanations = event.notRestoredExplanations;
        this.backForwardCacheDetails.explanationsTree = event.notRestoredExplanationsTree;
    }
    getResourcesMap() {
        return this.resourcesMap;
    }
}
export class PageDispatcher {
    #resourceTreeModel;
    constructor(resourceTreeModel) {
        this.#resourceTreeModel = resourceTreeModel;
    }
    backForwardCacheNotUsed(params) {
        this.#resourceTreeModel.onBackForwardCacheNotUsed(params);
    }
    domContentEventFired({ timestamp }) {
        this.#resourceTreeModel.dispatchEventToListeners(Events.DOMContentLoaded, timestamp);
    }
    loadEventFired({ timestamp }) {
        this.#resourceTreeModel.dispatchEventToListeners(Events.Load, { resourceTreeModel: this.#resourceTreeModel, loadTime: timestamp });
    }
    lifecycleEvent({ frameId, name }) {
        this.#resourceTreeModel.dispatchEventToListeners(Events.LifecycleEvent, { frameId, name });
    }
    frameAttached({ frameId, parentFrameId, stack }) {
        this.#resourceTreeModel.frameAttached(frameId, parentFrameId, stack);
    }
    frameNavigated({ frame, type }) {
        this.#resourceTreeModel.frameNavigated(frame, type);
    }
    documentOpened({ frame }) {
        this.#resourceTreeModel.documentOpened(frame);
    }
    frameDetached({ frameId, reason }) {
        this.#resourceTreeModel.frameDetached(frameId, reason === "swap" /* Protocol.Page.FrameDetachedEventReason.Swap */);
    }
    frameSubtreeWillBeDetached(_params) {
    }
    frameStartedLoading({}) {
    }
    frameStoppedLoading({ frameId }) {
        this.#resourceTreeModel.frameStoppedLoading(frameId);
    }
    frameRequestedNavigation({}) {
    }
    frameScheduledNavigation({}) {
    }
    frameClearedScheduledNavigation({}) {
    }
    frameStartedNavigating({}) {
    }
    navigatedWithinDocument({ frameId, url }) {
        this.#resourceTreeModel.navigatedWithinDocument(frameId, url);
    }
    frameResized() {
        this.#resourceTreeModel.dispatchEventToListeners(Events.FrameResized);
    }
    javascriptDialogOpening(event) {
        this.#resourceTreeModel.dispatchEventToListeners(Events.JavaScriptDialogOpening, event);
        if (!event.hasBrowserHandler) {
            void this.#resourceTreeModel.agent.invoke_handleJavaScriptDialog({ accept: false });
        }
    }
    javascriptDialogClosed({}) {
    }
    screencastFrame({}) {
    }
    screencastVisibilityChanged({}) {
    }
    interstitialShown() {
        this.#resourceTreeModel.isInterstitialShowing = true;
        this.#resourceTreeModel.dispatchEventToListeners(Events.InterstitialShown);
    }
    interstitialHidden() {
        this.#resourceTreeModel.isInterstitialShowing = false;
        this.#resourceTreeModel.dispatchEventToListeners(Events.InterstitialHidden);
    }
    windowOpen({}) {
    }
    compilationCacheProduced({}) {
    }
    fileChooserOpened({}) {
    }
    downloadWillBegin({}) {
    }
    downloadProgress() {
    }
}
SDKModel.register(ResourceTreeModel, { capabilities: 2 /* Capability.DOM */, autostart: true, early: true });
export var PrimaryPageChangeType;
(function (PrimaryPageChangeType) {
    PrimaryPageChangeType["NAVIGATION"] = "Navigation";
    PrimaryPageChangeType["ACTIVATION"] = "Activation";
})(PrimaryPageChangeType || (PrimaryPageChangeType = {}));
//# sourceMappingURL=ResourceTreeModel.js.map