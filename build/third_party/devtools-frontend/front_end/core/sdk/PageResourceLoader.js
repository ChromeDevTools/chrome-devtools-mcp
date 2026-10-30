// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as i18n from '../i18n/i18n.js';
import * as Root from '../root/root.js';
import { IOModel } from './IOModel.js';
import { MultitargetNetworkManager, NetworkManager } from './NetworkManager.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel, } from './ResourceTreeModel.js';
import { cacheDisabledSettingDescriptor, enableRemoteFileLoadingSettingDescriptor } from './SDKSettings.js';
import { SecurityOrigin } from './SecurityOrigin.js';
import { TargetManager } from './TargetManager.js';
const UIStrings = {
    /**
     * @description Error message for canceled source map loads.
     */
    loadCanceledDueToReloadOf: 'Load canceled due to reload of inspected page',
    /**
     * @description Error message in the Developer resources panel when DevTools refuses to load a
     * resource (e.g. a source map) for a frame that is no longer available and is cross-origin with
     * the page.
     */
    crossOriginFrameLoadBlocked: 'Can’t load resource for an unavailable cross-origin frame',
    /**
     * @description Error message in the Developer resources panel when an http(s) resource cannot be
     * loaded because no target is available.
     */
    noTargetForHttpLoad: 'Can’t load http(s) resource without a target',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/PageResourceLoader.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function isExtensionInitiator(initiator) {
    return 'extensionId' in initiator;
}
/** Used for revealing a resource. **/
export class ResourceKey {
    key;
    constructor(key) {
        this.key = key;
    }
}
/**
 * The page resource loader is a bottleneck for all DevTools-initiated resource loads. For each such load, it keeps a
 * `PageResource` object around that holds meta information. This can be as the basis for reporting to the user which
 * resources were loaded, and whether there was a load error.
 */
export class PageResourceLoader extends Common.ObjectWrapper.ObjectWrapper {
    #targetManager;
    #settings;
    #userAgentProvider;
    #currentlyLoading = 0;
    #currentlyLoadingPerTarget = new Map();
    #maxConcurrentLoads;
    #pageResources = new Map();
    #queuedLoads = [];
    #loadOverride;
    constructor(targetManager, settings, userAgentProvider, loadOverride, maxConcurrentLoads = 500) {
        super();
        this.#targetManager = targetManager;
        this.#settings = settings;
        this.#userAgentProvider = userAgentProvider;
        this.#maxConcurrentLoads = maxConcurrentLoads;
        this.#targetManager.addModelListener(ResourceTreeModel, ResourceTreeModelEvents.PrimaryPageChanged, this.onPrimaryPageChanged, this);
        this.#loadOverride = loadOverride;
    }
    static instance({ forceNew, targetManager, settings, userAgentProvider, loadOverride, maxConcurrentLoads } = {
        forceNew: false,
        loadOverride: null,
    }) {
        if (forceNew) {
            /* eslint-disable @devtools/no-instance-of-migrated-singletons */
            Root.DevToolsContext.globalInstance().set(PageResourceLoader, new PageResourceLoader(targetManager ?? TargetManager.instance(), settings ?? Common.Settings.Settings.instance(), userAgentProvider ?? MultitargetNetworkManager.instance(), loadOverride, maxConcurrentLoads));
            /* eslint-enable @devtools/no-instance-of-migrated-singletons */
        }
        return Root.DevToolsContext.globalInstance().get(PageResourceLoader);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(PageResourceLoader);
    }
    onPrimaryPageChanged(event) {
        const { frame: mainFrame, type } = event.data;
        if (!mainFrame.isOutermostFrame()) {
            return;
        }
        for (const { reject } of this.#queuedLoads) {
            reject(new Error(i18nString(UIStrings.loadCanceledDueToReloadOf)));
        }
        this.#queuedLoads = [];
        const mainFrameTarget = mainFrame.resourceTreeModel().target();
        const keptResources = new Map();
        // If the navigation is a prerender-activation, the pageResources for the destination page have
        // already been preloaded. In such cases, we therefore don't just discard all pageResources, but
        // instead make sure to keep the pageResources for the prerendered target.
        for (const [key, pageResource] of this.#pageResources.entries()) {
            if ((type === "Activation" /* PrimaryPageChangeType.ACTIVATION */) && mainFrameTarget === pageResource.initiator.target) {
                keptResources.set(key, pageResource);
            }
        }
        this.#pageResources = keptResources;
        this.dispatchEventToListeners("Update" /* Events.UPDATE */);
    }
    getResourcesLoaded() {
        return this.#pageResources;
    }
    getScopedResourcesLoaded() {
        return new Map([...this.#pageResources].filter(([_, pageResource]) => this.#targetManager.isInScope(pageResource.initiator.target) ||
            isExtensionInitiator(pageResource.initiator)));
    }
    /**
     * Loading is the number of currently loading and queued items. Resources is the total number of resources,
     * including loading and queued resources, but not including resources that are still loading but scheduled
     * for cancelation.;
     */
    getNumberOfResources() {
        return { loading: this.#currentlyLoading, queued: this.#queuedLoads.length, resources: this.#pageResources.size };
    }
    getScopedNumberOfResources() {
        let loadingCount = 0;
        for (const [targetId, count] of this.#currentlyLoadingPerTarget) {
            const target = this.#targetManager.targetById(targetId);
            if (this.#targetManager.isInScope(target)) {
                loadingCount += count;
            }
        }
        return { loading: loadingCount, resources: this.getScopedResourcesLoaded().size };
    }
    async acquireLoadSlot(target) {
        this.#currentlyLoading++;
        if (target) {
            const currentCount = this.#currentlyLoadingPerTarget.get(target.id()) || 0;
            this.#currentlyLoadingPerTarget.set(target.id(), currentCount + 1);
        }
        if (this.#currentlyLoading > this.#maxConcurrentLoads) {
            const { promise: waitForCapacity, resolve, reject, } = Promise.withResolvers();
            this.#queuedLoads.push({ resolve, reject });
            await waitForCapacity;
        }
    }
    releaseLoadSlot(target) {
        this.#currentlyLoading--;
        if (target) {
            const currentCount = this.#currentlyLoadingPerTarget.get(target.id());
            if (currentCount) {
                this.#currentlyLoadingPerTarget.set(target.id(), currentCount - 1);
            }
        }
        const entry = this.#queuedLoads.shift();
        if (entry) {
            entry.resolve();
        }
    }
    static makeExtensionKey(url, initiator) {
        if (isExtensionInitiator(initiator) && initiator.extensionId) {
            return `${url}-${initiator.extensionId}`;
        }
        throw new Error('Invalid initiator');
    }
    static makeKey(url, initiator) {
        if (initiator.frameId) {
            return `${url}-${initiator.frameId}`;
        }
        if (initiator.target) {
            return `${url}-${initiator.target.id()}`;
        }
        throw new Error('Invalid initiator');
    }
    resourceLoadedThroughExtension(pageResource) {
        const key = PageResourceLoader.makeExtensionKey(pageResource.url, pageResource.initiator);
        this.#pageResources.set(key, pageResource);
        this.dispatchEventToListeners("Update" /* Events.UPDATE */);
    }
    async loadResource(url, initiator, isBinary = false) {
        if (isExtensionInitiator(initiator)) {
            throw new Error('Invalid initiator');
        }
        const hasExplicitTarget = Boolean(initiator.target);
        // Fall back to the primary page target when the initiator has no explicit target
        // so that resources loaded for detached frames remain scoped to the primary page
        // and go through target-based CSP checks instead of host bindings.
        let effectiveInitiator = initiator;
        if (!initiator.target) {
            const primaryTarget = this.#targetManager.primaryPageTarget();
            if (primaryTarget) {
                effectiveInitiator = {
                    ...initiator,
                    target: primaryTarget,
                };
            }
        }
        const key = PageResourceLoader.makeKey(url, effectiveInitiator);
        const pageResource = {
            success: null,
            size: null,
            duration: null,
            url,
            initiator: effectiveInitiator,
        };
        this.#pageResources.set(key, pageResource);
        this.dispatchEventToListeners("Update" /* Events.UPDATE */);
        const startTime = performance.now();
        try {
            await this.acquireLoadSlot(effectiveInitiator.target);
            const resultPromise = this.dispatchLoad(url, effectiveInitiator, isBinary, hasExplicitTarget);
            const result = await resultPromise;
            pageResource.errorMessage = result.errorDescription.message;
            pageResource.success = result.success;
            if (result.success) {
                pageResource.size = result.content.length;
                return { content: result.content };
            }
            throw new Error(result.errorDescription.message);
        }
        catch (e) {
            if (pageResource.errorMessage === undefined) {
                pageResource.errorMessage = e.message;
            }
            if (pageResource.success === null) {
                pageResource.success = false;
            }
            throw e;
        }
        finally {
            pageResource.duration = performance.now() - startTime;
            this.releaseLoadSlot(effectiveInitiator.target);
            this.dispatchEventToListeners("Update" /* Events.UPDATE */);
        }
    }
    #resolveFrameTarget(initiator) {
        let frameTarget = initiator.target;
        let parentFrameId = null;
        while (frameTarget && !frameTarget.model(ResourceTreeModel)) {
            parentFrameId = parentFrameId ?? frameTarget.targetInfo()?.parentFrameId ?? null;
            frameTarget = frameTarget.parentTarget();
        }
        const resourceTreeModel = frameTarget?.model(ResourceTreeModel);
        const mainFrameId = resourceTreeModel?.mainFrame?.id ?? null;
        // Normalize empty-string frame IDs (used by ScriptsHandler for unassociated scripts)
        // to null and fall back to the parent frame ID discovered from a worker or subtarget.
        let candidateFrameId = null;
        if (initiator.frameId) {
            candidateFrameId = initiator.frameId;
        }
        else if (parentFrameId) {
            candidateFrameId = parentFrameId;
        }
        if (frameTarget && frameTarget !== initiator.target && !candidateFrameId) {
            // The initiator is a non-frame target (e.g. a service worker or a shared worker) that is not
            // owned by any single frame. Don't attribute the load to the page's main frame, as the browser
            // would then issue the request with the main frame's origin and credentials. Load through the
            // initiator's own target instead, where the browser attributes the request to the worker's origin.
            return { frameTarget: initiator.target, frameId: null, initiatorFrameId: null, usedFallbackMainFrame: false };
        }
        // Keep candidateFrameId only if ResourceTreeModel has not populated frames yet
        // (mainFrame is null) or if candidateFrameId still exists in the active frame tree.
        let validFrameId = null;
        if (candidateFrameId) {
            if (!resourceTreeModel?.mainFrame || resourceTreeModel.frameForId(candidateFrameId)) {
                validFrameId = candidateFrameId;
            }
        }
        // Track whether we had to fall back to the main frame because the initiator's
        // frame was missing or detached, so dispatchLoad can verify same-origin before
        // issuing a network load in the main frame's context.
        let usedFallbackMainFrame = false;
        if (!validFrameId && mainFrameId) {
            usedFallbackMainFrame = true;
        }
        // Use the validated frame ID if available; otherwise fall back to the main frame ID
        // so that CDP's Network.loadNetworkResource and getSecurityIsolationStatus can
        // enforce the page's CSP even after the original frame was detached.
        const frameId = validFrameId ?? mainFrameId;
        // Preserve the candidate frame ID (before mainFrameId fallback) so
        // #isSameOriginWithPrimaryPage can detect detached or unassociated frames and
        // disallow host-bindings fallback.
        return { frameTarget, frameId, initiatorFrameId: candidateFrameId, usedFallbackMainFrame };
    }
    #isSameOriginWithPrimaryPage(hasExplicitTarget, frameTarget, initiatorFrameId) {
        // Disallow host-bindings fallback when the initiator had no explicit target.
        if (!hasExplicitTarget) {
            return false;
        }
        const primaryFrame = this.#targetManager.primaryPageTarget()?.model(ResourceTreeModel)?.mainFrame;
        // Look up the original initiator frame in frameTarget's active frame tree; if the frame
        // was detached, frameForId returns null and we fail closed below.
        const initiatorFrame = initiatorFrameId ? frameTarget?.model(ResourceTreeModel)?.frameForId(initiatorFrameId) : null;
        if (!primaryFrame || !initiatorFrame) {
            return false;
        }
        return initiatorFrame.securityOrigin().isSameOriginWith(primaryFrame.securityOrigin());
    }
    #isInitiatorUrlSameOriginWithMainFrame(initiator, frameTarget) {
        const mainFrame = frameTarget?.model(ResourceTreeModel)?.mainFrame;
        if (!mainFrame || !initiator.initiatorUrl) {
            return false;
        }
        // Compare the target main frame's security origin against the initiator script's URL origin
        // to ensure cross-origin detached frame requests are not loaded under mainFrame.id.
        return mainFrame.securityOrigin().isSameOriginWith(SecurityOrigin.create(initiator.initiatorUrl));
    }
    async dispatchLoad(url, initiator, isBinary, hasExplicitTarget) {
        if (isExtensionInitiator(initiator)) {
            throw new Error('Invalid initiator');
        }
        const failureReason = null;
        if (this.#loadOverride) {
            return await this.#loadOverride(url);
        }
        const parsedURL = new Common.ParsedURL.ParsedURL(url);
        const isHttp = Boolean(parsedURL && (parsedURL.scheme === 'http' || parsedURL.scheme === 'https'));
        const loadThroughTarget = this.getLoadThroughTargetSetting().get();
        const eligibleForLoadFromTarget = Boolean(loadThroughTarget && parsedURL && parsedURL.scheme !== 'file' && parsedURL.scheme !== 'data' &&
            parsedURL.scheme !== 'devtools' && initiator.target);
        Host.userMetrics.developerResourceScheme(this.getDeveloperResourceScheme(parsedURL));
        if (eligibleForLoadFromTarget && initiator.target) {
            // Default to enforcing CSP for http(s) resources (fail-closed). Only relax
            // if the isolation-status query positively confirms no connect-src/default-src
            // directive is present. A null/error response keeps the guard armed so that a
            // detached-frame or protocol-error path cannot fall through to loadFromHostBindings.
            let mustEnforceCSP = isHttp;
            const { frameTarget, frameId, initiatorFrameId, usedFallbackMainFrame } = this.#resolveFrameTarget(initiator);
            // Do not execute network loads under mainFrame.id (which uses the main frame's origin,
            // cookies, and CSP) if a detached frame's initiatorUrl is cross-origin with the main frame.
            if (usedFallbackMainFrame && !this.#isInitiatorUrlSameOriginWithMainFrame(initiator, frameTarget)) {
                Host.userMetrics.developerResourceLoaded(Host.UserMetrics.DeveloperResourceLoaded.LOAD_THROUGH_PAGE_FAILURE);
                return {
                    success: false,
                    content: '',
                    errorDescription: {
                        statusCode: 0,
                        message: i18nString(UIStrings.crossOriginFrameLoadBlocked),
                    },
                };
            }
            if (isHttp && frameTarget) {
                const networkManager = frameTarget.model(NetworkManager);
                if (networkManager) {
                    const status = await networkManager.getSecurityIsolationStatus(frameId);
                    if (status?.csp) {
                        mustEnforceCSP = status.csp.some(csp => csp.effectiveDirectives.includes('connect-src') ||
                            csp.effectiveDirectives.includes('default-src'));
                    }
                }
            }
            try {
                Host.userMetrics.developerResourceLoaded(Host.UserMetrics.DeveloperResourceLoaded.LOAD_THROUGH_PAGE_VIA_TARGET);
                const result = await this.loadFromTarget(frameTarget ?? initiator.target, frameId, url, isBinary);
                return result;
            }
            catch (e) {
                if (e instanceof Error) {
                    Host.userMetrics.developerResourceLoaded(Host.UserMetrics.DeveloperResourceLoaded.LOAD_THROUGH_PAGE_FAILURE);
                    if (mustEnforceCSP || !this.#isSameOriginWithPrimaryPage(hasExplicitTarget, frameTarget, initiatorFrameId) ||
                        e.message.includes('CSP violation')) {
                        return {
                            success: false,
                            content: '',
                            errorDescription: {
                                statusCode: 0,
                                message: e.message,
                            },
                        };
                    }
                }
            }
            Host.userMetrics.developerResourceLoaded(Host.UserMetrics.DeveloperResourceLoaded.LOAD_THROUGH_PAGE_FALLBACK);
        }
        else {
            const code = loadThroughTarget ? Host.UserMetrics.DeveloperResourceLoaded.FALLBACK_PER_PROTOCOL :
                Host.UserMetrics.DeveloperResourceLoaded.FALLBACK_PER_OVERRIDE;
            Host.userMetrics.developerResourceLoaded(code);
            // Fail closed for HTTP(S) loads when target-based loading is enabled but no target is available,
            // preventing unauthenticated fallback to privileged host bindings.
            if (loadThroughTarget && isHttp && !initiator.target) {
                return {
                    success: false,
                    content: '',
                    errorDescription: {
                        statusCode: 0,
                        message: i18nString(UIStrings.noTargetForHttpLoad),
                    },
                };
            }
        }
        const result = await this.loadFromHostBindings(url);
        if (eligibleForLoadFromTarget && !result.success) {
            Host.userMetrics.developerResourceLoaded(Host.UserMetrics.DeveloperResourceLoaded.FALLBACK_FAILURE);
        }
        if (failureReason) {
            // In case we have a success, add a note about why the load through the target failed.
            result.errorDescription.message =
                `Fetch through target failed: ${failureReason}; Fallback: ${result.errorDescription.message}`;
        }
        return result;
    }
    getDeveloperResourceScheme(parsedURL) {
        if (!parsedURL || parsedURL.scheme === '') {
            return Host.UserMetrics.DeveloperResourceScheme.UKNOWN;
        }
        const isLocalhost = parsedURL.host === 'localhost' || parsedURL.host.endsWith('.localhost');
        switch (parsedURL.scheme) {
            case 'file':
                return Host.UserMetrics.DeveloperResourceScheme.FILE;
            case 'data':
                return Host.UserMetrics.DeveloperResourceScheme.DATA;
            case 'blob':
                return Host.UserMetrics.DeveloperResourceScheme.BLOB;
            case 'http':
                return isLocalhost ? Host.UserMetrics.DeveloperResourceScheme.HTTP_LOCALHOST :
                    Host.UserMetrics.DeveloperResourceScheme.HTTP;
            case 'https':
                return isLocalhost ? Host.UserMetrics.DeveloperResourceScheme.HTTPS_LOCALHOST :
                    Host.UserMetrics.DeveloperResourceScheme.HTTPS;
        }
        return Host.UserMetrics.DeveloperResourceScheme.OTHER;
    }
    async loadFromTarget(target, frameId, url, isBinary) {
        const networkManager = target.model(NetworkManager);
        const ioModel = target.model(IOModel);
        const disableCache = this.#settings.resolve(cacheDisabledSettingDescriptor).get();
        const resource = await networkManager.loadNetworkResource(frameId, url, { disableCache, includeCredentials: true });
        try {
            const content = resource.stream ?
                (isBinary ? await ioModel.readToBuffer(resource.stream) : await ioModel.readToString(resource.stream)) :
                '';
            return {
                success: resource.success,
                content,
                errorDescription: {
                    statusCode: resource.httpStatusCode || 0,
                    netError: resource.netError,
                    netErrorName: resource.netErrorName,
                    message: Host.ResourceLoader.netErrorToMessage(resource.netError, resource.httpStatusCode, resource.netErrorName) ||
                        '',
                },
            };
        }
        finally {
            if (resource.stream) {
                void ioModel.close(resource.stream);
            }
        }
    }
    async loadFromHostBindings(url) {
        const headers = {};
        const currentUserAgent = this.#userAgentProvider.currentUserAgent();
        if (currentUserAgent) {
            headers['User-Agent'] = currentUserAgent;
        }
        if (this.#settings.resolve(cacheDisabledSettingDescriptor).get()) {
            headers['Cache-Control'] = 'no-cache';
        }
        const allowRemoteFilePaths = this.#settings.resolve(enableRemoteFileLoadingSettingDescriptor).get();
        return await new Promise(resolve => Host.ResourceLoader.load(url, headers, (success, _responseHeaders, content, errorDescription) => {
            resolve({ success, content, errorDescription });
        }, allowRemoteFilePaths));
    }
    getLoadThroughTargetSetting() {
        return this.#settings.createSetting('load-through-target', true);
    }
}
export var Events;
(function (Events) {
    Events["UPDATE"] = "Update";
})(Events || (Events = {}));
//# sourceMappingURL=PageResourceLoader.js.map