// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
var _a;
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { Cookie } from './Cookie.js';
import { DirectSocketChunkType, DirectSocketStatus, DirectSocketType, Events as NetworkRequestEvents, NetworkRequest, } from './NetworkRequest.js';
import { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { cacheDisabledSettingDescriptor, monitoringXHREnabledSettingDescriptor, preserveNetworkLogSettingDescriptor, requestBlockingEnabledSettingDescriptor, } from './SDKSettings.js';
import { TargetManager } from './TargetManager.js';
const UIStrings = {
    /**
     * @description Explanation why no content is shown for WebSocket connection.
     */
    noContentForWebSocket: 'Content for WebSockets is currently not supported',
    /**
     * @description Explanation why no content is shown for Server-Sent Events (SSE).
     */
    noContentForSSE: 'Content for Server-Sent Events (SSE) is currently not supported',
    /**
     * @description Explanation why no content is shown for redirect response.
     */
    noContentForRedirect: 'No content available because this request was redirected',
    /**
     * @description Explanation why no content is shown for preflight request.
     */
    noContentForPreflight: 'No content available for preflight request',
    /**
     * @description Text to indicate that network throttling is disabled.
     */
    noThrottling: 'No throttling',
    /**
     * @description Text to indicate the network connectivity is offline.
     */
    offline: 'Offline',
    /**
     * @description Text in Network Manager representing the "3G" throttling preset.
     */
    slowG: '3G', // Named `slowG` for legacy reasons and because this value
    // is serialized locally on the user's machine: if we
    // change it we break their stored throttling settings.
    // (See crrev.com/c/2947255)
    /**
     * @description Text in Network Manager representing the "Slow 4G" throttling preset.
     */
    fastG: 'Slow 4G', // Named `fastG` for legacy reasons and because this value
    // is serialized locally on the user's machine: if we
    // change it we break their stored throttling settings.
    // (See crrev.com/c/2947255)
    /**
     * @description Text in Network Manager representing the "Fast 4G" throttling preset.
     */
    fast4G: 'Fast 4G',
    /**
     * @description Text in Network Manager representing the "Blocking" throttling preset.
     */
    block: 'Block',
    /**
     * @description Message in Network Manager indicating that a request was blocked by DevTools.
     * @example {https://example.com} PH1
     */
    requestWasBlockedByDevtoolsS: 'Request was blocked by DevTools: "{PH1}"',
    /**
     * @description Console message when a request failed loading.
     * @example {XHR} PH1
     * @example {GET} PH2
     * @example {https://example.com} PH3
     */
    sFailedLoadingSS: '{PH1} failed loading: {PH2} "{PH3}"',
    /**
     * @description Console message when a request finished loading.
     * @example {XHR} PH1
     * @example {GET} PH2
     * @example {https://example.com} PH3
     */
    sFinishedLoadingSS: '{PH1} finished loading: {PH2} "{PH3}"',
    /**
     * @description One of direct socket connection statuses.
     */
    directSocketStatusOpening: 'Opening',
    /**
     * @description One of direct socket connection statuses.
     */
    directSocketStatusOpen: 'Open',
    /**
     * @description One of direct socket connection statuses.
     */
    directSocketStatusClosed: 'Closed',
    /**
     * @description One of direct socket connection statuses.
     */
    directSocketStatusAborted: 'Aborted',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/NetworkManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
const requestToManagerMap = new WeakMap();
/** Resource types eligible for resend with full fidelity. */
const FULL_FIDELITY_RESEND_TYPES = new Set([
    Common.ResourceType.resourceTypes.XHR,
    Common.ResourceType.resourceTypes.Fetch,
    Common.ResourceType.resourceTypes.Script,
    Common.ResourceType.resourceTypes.Stylesheet,
    Common.ResourceType.resourceTypes.Image,
    Common.ResourceType.resourceTypes.Media,
    Common.ResourceType.resourceTypes.Font,
    Common.ResourceType.resourceTypes.Wasm,
    Common.ResourceType.resourceTypes.Manifest,
    Common.ResourceType.resourceTypes.TextTrack,
    Common.ResourceType.resourceTypes.SourceMapScript,
    Common.ResourceType.resourceTypes.SourceMapStyleSheet,
]);
/** Resource types eligible for resend but with reduced fidelity. */
const PARTIAL_FIDELITY_RESEND_TYPES = new Set([
    Common.ResourceType.resourceTypes.Document,
    Common.ResourceType.resourceTypes.Prefetch,
    Common.ResourceType.resourceTypes.Ping,
]);
const CONNECTION_TYPES = new Map([
    ['2g', "cellular2g" /* Protocol.Network.ConnectionType.Cellular2g */],
    ['3g', "cellular3g" /* Protocol.Network.ConnectionType.Cellular3g */],
    ['4g', "cellular4g" /* Protocol.Network.ConnectionType.Cellular4g */],
    ['bluetooth', "bluetooth" /* Protocol.Network.ConnectionType.Bluetooth */],
    ['wifi', "wifi" /* Protocol.Network.ConnectionType.Wifi */],
    ['wimax', "wimax" /* Protocol.Network.ConnectionType.Wimax */],
]);
/**
 * We store two settings to disk to persist network throttling.
 * 1. The custom conditions that the user has defined.
 * 2. The active `key` that applies the correct current preset.
 * The reason the setting creation functions are defined here is because they are referred
 * to in multiple places, and this ensures we don't have accidental typos which
 * mean extra settings get mistakenly created.
 */
export function customUserNetworkConditionsSetting(settings) {
    return settings.moduleSetting('custom-network-conditions');
}
export function activeNetworkThrottlingKeySetting(settings) {
    return settings.createSetting('active-network-condition-key', "NO_THROTTLING" /* PredefinedThrottlingConditionKey.NO_THROTTLING */);
}
export class NetworkManager extends SDKModel {
    dispatcher;
    fetchDispatcher;
    #networkAgent;
    #bypassServiceWorkerSetting;
    activeNetworkThrottlingKey;
    constructor(target) {
        super(target);
        this.dispatcher = new NetworkDispatcher(this);
        this.fetchDispatcher = new FetchDispatcher(target.fetchAgent(), this);
        this.#networkAgent = target.networkAgent();
        target.registerNetworkDispatcher(this.dispatcher);
        target.registerFetchDispatcher(this.fetchDispatcher);
        const settings = this.target().targetManager().settings;
        this.activeNetworkThrottlingKey = activeNetworkThrottlingKeySetting(settings);
        if (settings.resolve(cacheDisabledSettingDescriptor).get()) {
            void this.#networkAgent.invoke_setCacheDisabled({ cacheDisabled: true });
        }
        void this.#networkAgent.invoke_enable({
            maxPostDataSize: MAX_EAGER_POST_REQUEST_BODY_LENGTH,
            maxTotalBufferSize: MAX_RESPONSE_BODY_TOTAL_BUFFER_LENGTH,
            reportDirectSocketTraffic: true,
        });
        if (Root.Runtime.hostConfig.devToolsEnableDurableMessages?.enabled) {
            const preserveLogSetting = settings.resolve(preserveNetworkLogSettingDescriptor);
            this.#updateDurableMessages(preserveLogSetting.get());
            preserveLogSetting.addChangeListener(this.preserveLogChanged, this);
        }
        void this.#networkAgent.invoke_setAttachDebugStack({ enabled: true });
        this.#bypassServiceWorkerSetting = settings.createSetting('bypass-service-worker', false);
        if (this.#bypassServiceWorkerSetting.get()) {
            this.bypassServiceWorkerChanged();
        }
        this.#bypassServiceWorkerSetting.addChangeListener(this.bypassServiceWorkerChanged, this);
        settings.resolve(cacheDisabledSettingDescriptor).addChangeListener(this.cacheDisabledSettingChanged, this);
    }
    static forRequest(request) {
        return requestToManagerMap.get(request) || null;
    }
    static canResendRequest(request, fullFidelity) {
        if (!requestToManagerMap.get(request) || !request.backendRequestId() || request.isRedirect()) {
            return false;
        }
        const type = request.resourceType();
        if (FULL_FIDELITY_RESEND_TYPES.has(type)) {
            return true;
        }
        if (!fullFidelity && PARTIAL_FIDELITY_RESEND_TYPES.has(type)) {
            return true;
        }
        return false;
    }
    static replayRequest(request) {
        void NetworkManager.resendRequest(request);
    }
    static async resendRequest(request) {
        const manager = requestToManagerMap.get(request);
        const requestId = request.backendRequestId();
        if (!manager || !requestId || request.isRedirect()) {
            return;
        }
        Host.userMetrics.resendRequest(Host.UserMetrics.resendRequestType(request.resourceType()));
        // XHR requests use the existing CDP replay mechanism.
        if (request.resourceType() === Common.ResourceType.resourceTypes.XHR) {
            void manager.#networkAgent.invoke_replayXHR({ requestId });
            return;
        }
        // All other eligible types use fetch via Runtime.evaluate.
        const target = manager.target();
        const runtimeModel = target.model(RuntimeModel);
        if (!runtimeModel) {
            return;
        }
        // Resolve execution context: prefer the frame's default context.
        let executionContext = null;
        const frameId = request.frameId;
        if (frameId) {
            executionContext = runtimeModel.executionContexts().find(ctx => ctx.frameId === frameId && ctx.isDefault) ?? null;
        }
        const usesFallbackContext = !executionContext;
        if (!executionContext) {
            executionContext = runtimeModel.defaultExecutionContext();
        }
        if (!executionContext) {
            return;
        }
        if (usesFallbackContext) {
            runtimeModel.target().targetManager().getConsole().warn('Resend: original execution context unavailable, using top-level context.');
        }
        // Build the fetch expression.
        const method = request.requestMethod;
        const url = request.url();
        const headers = [];
        for (const { name, value } of request.requestHeaders()) {
            // Skip HTTP/2+ pseudo-headers (e.g. :authority, :method, :path, :scheme).
            if (name.startsWith(':')) {
                continue;
            }
            // Skip headers the browser sets automatically for fetch.
            const lower = name.toLowerCase();
            if (lower === 'host' || lower === 'connection' || lower === 'content-length' || lower === 'cookie' ||
                lower === 'origin' || lower === 'referer') {
                continue;
            }
            headers.push([name, value]);
        }
        const body = await request.requestFormData();
        const fetchOptions = {
            method,
            headers,
            credentials: 'include',
        };
        const isGetOrHead = method === 'GET' || method === 'HEAD';
        if (body && !isGetOrHead) {
            fetchOptions.body = body;
        }
        const expression = `fetch(${JSON.stringify(url)}, ${JSON.stringify(fetchOptions)})`;
        const response = await target.runtimeAgent().invoke_evaluate({
            expression,
            // Use uniqueContextId if available, otherwise fall back to contextId.
            ...(executionContext.uniqueId ? { uniqueContextId: executionContext.uniqueId } : { contextId: executionContext.id }),
            silent: false,
            awaitPromise: true,
        });
        if (response.getError() || response.exceptionDetails) {
            const errorText = response.getError() || response.exceptionDetails?.exception?.description ||
                response.exceptionDetails?.text || 'Unknown error';
            runtimeModel.target().targetManager().getConsole().error(`Resend failed for ${url}: ${errorText}`);
        }
    }
    static async searchInRequest(request, query, caseSensitive, isRegex) {
        const manager = NetworkManager.forRequest(request);
        const requestId = request.backendRequestId();
        if (!manager || !requestId || request.isRedirect()) {
            return [];
        }
        const response = await manager.#networkAgent.invoke_searchInResponseBody({ requestId, query, caseSensitive, isRegex });
        return TextUtils.TextUtils.performSearchInSearchMatches(response.result || [], query, caseSensitive, isRegex);
    }
    static async requestContentData(request) {
        if (request.resourceType() === Common.ResourceType.resourceTypes.WebSocket) {
            return { error: i18nString(UIStrings.noContentForWebSocket) };
        }
        if (!request.finished) {
            if (Boolean(request.eventSourceMessages()?.length)) {
                return { error: i18nString(UIStrings.noContentForSSE) };
            }
            await request.once(NetworkRequestEvents.FINISHED_LOADING);
        }
        if (request.isRedirect()) {
            return { error: i18nString(UIStrings.noContentForRedirect) };
        }
        if (request.isPreflightRequest()) {
            return { error: i18nString(UIStrings.noContentForPreflight) };
        }
        const manager = NetworkManager.forRequest(request);
        if (!manager) {
            return { error: 'No network manager for request' };
        }
        const requestId = request.backendRequestId();
        if (!requestId) {
            return { error: 'No backend request id for request' };
        }
        const response = await manager.#networkAgent.invoke_getResponseBody({ requestId });
        const error = response.getError();
        if (error) {
            return { error };
        }
        return new TextUtils.ContentData.ContentData(response.body, response.base64Encoded, request.mimeType, request.charset() ?? undefined);
    }
    /**
     * Returns the already received bytes for an in-flight request. After calling this method
     * "dataReceived" events will contain additional data.
     */
    static async streamResponseBody(request) {
        if (request.finished) {
            return { error: 'Streaming the response body is only available for in-flight requests.' };
        }
        const manager = NetworkManager.forRequest(request);
        if (!manager) {
            return { error: 'No network manager for request' };
        }
        const requestId = request.backendRequestId();
        if (!requestId) {
            return { error: 'No backend request id for request' };
        }
        const response = await manager.#networkAgent.invoke_streamResourceContent({ requestId });
        const error = response.getError();
        if (error) {
            return { error };
        }
        // Wait for at least the `responseReceived event so we have accurate mimetype and charset.
        await request.waitForResponseReceived();
        return new TextUtils.ContentData.ContentData(response.bufferedData, /* isBase64=*/ true, request.mimeType, request.charset() ?? undefined);
    }
    static async requestPostData(request) {
        const manager = NetworkManager.forRequest(request);
        if (!manager) {
            console.error('No network manager for request');
            return null;
        }
        const requestId = request.backendRequestId();
        if (!requestId) {
            console.error('No backend request id for request');
            return null;
        }
        try {
            const { postData, base64Encoded } = await manager.#networkAgent.invoke_getRequestPostData({ requestId });
            if (base64Encoded && postData) {
                // Decode base64 to get raw bytes as an ArrayBuffer.
                const binaryString = globalThis.atob(postData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                // Extract charset from request Content-Type header, defaulting to utf-8.
                const requestContentType = request.requestContentType();
                const charset = requestContentType ? Platform.MimeType.parseContentType(requestContentType).charset ?? 'utf-8' : 'utf-8';
                // If the request body is compressed, attempt to decompress it.
                const contentEncoding = request.requestContentEncoding()?.toLowerCase();
                if (contentEncoding) {
                    const decompressed = await NetworkManager.#tryDecompressBody(bytes.buffer, contentEncoding, charset);
                    if (decompressed !== null) {
                        return decompressed;
                    }
                }
                // Not compressed or decompression not applicable -- decode as text.
                return new TextDecoder(charset).decode(bytes);
            }
            return postData;
        }
        catch (e) {
            return e.message;
        }
    }
    /**
     * Returns the request post data as a ContentData suitable for binary
     * viewers (hex, base64, utf-8) in the Payload tab.  When the backend
     * provides base64-encoded (possibly compressed) data, the body is
     * decompressed first so viewers show the actual payload bytes rather
     * than gzip/deflate framing.
     */
    static async requestPostDataContentData(request) {
        const manager = NetworkManager.forRequest(request);
        if (!manager) {
            return { error: 'No network manager for request' };
        }
        const requestId = request.backendRequestId();
        if (!requestId) {
            return { error: 'No backend request id for request' };
        }
        try {
            const response = await manager.#networkAgent.invoke_getRequestPostData({ requestId });
            const error = response.getError();
            if (error) {
                return { error };
            }
            const { postData, base64Encoded } = response;
            if (!postData) {
                return { error: 'No post data' };
            }
            const requestContentType = request.requestContentType() ?? 'application/octet-stream';
            const { charset } = Platform.MimeType.parseContentType(requestContentType);
            if (base64Encoded && postData) {
                return await TextUtils.ContentData.ContentData.fromCompressedBase64(postData, requestContentType, charset ?? undefined, request.requestContentEncoding());
            }
            return new TextUtils.ContentData.ContentData(postData, false, requestContentType, charset ?? undefined);
        }
        catch (e) {
            return { error: e.message };
        }
    }
    /**
     * Attempts to decompress a compressed request body.
     * Returns the decompressed string, or null if decompression is not applicable.
     */
    static async #tryDecompressBody(buffer, encoding, charset) {
        try {
            if (encoding.includes('gzip') && Common.Gzip.isGzip(buffer)) {
                return await Common.Gzip.decompress(buffer, charset);
            }
            if (encoding.includes('deflate')) {
                return await Common.Gzip.decompressDeflate(buffer, charset);
            }
        }
        catch (e) {
            console.warn('Failed to decompress request body:', e);
        }
        return null;
    }
    static connectionType(conditions) {
        if (!conditions.download && !conditions.upload) {
            return "none" /* Protocol.Network.ConnectionType.None */;
        }
        try {
            const title = typeof conditions.title === 'function' ? conditions.title().toLowerCase() : conditions.title.toLowerCase();
            for (const [name, protocolType] of CONNECTION_TYPES) {
                if (title.includes(name)) {
                    return protocolType;
                }
            }
        }
        catch {
            // If the i18nKey for this condition has changed, calling conditions.title() will break, so in that case we reset to NONE
            return "none" /* Protocol.Network.ConnectionType.None */;
        }
        return "other" /* Protocol.Network.ConnectionType.Other */;
    }
    static lowercaseHeaders(headers) {
        const newHeaders = {};
        for (const headerName in headers) {
            newHeaders[headerName.toLowerCase()] = headers[headerName];
        }
        return newHeaders;
    }
    requestForURL(url) {
        return this.dispatcher.requestForURL(url);
    }
    requestForId(id) {
        return this.dispatcher.requestForId(id);
    }
    requestForLoaderId(loaderId) {
        return this.dispatcher.requestForLoaderId(loaderId);
    }
    cacheDisabledSettingChanged({ data: enabled }) {
        void this.#networkAgent.invoke_setCacheDisabled({ cacheDisabled: enabled });
    }
    preserveLogChanged({ data: enabled }) {
        this.#updateDurableMessages(enabled);
    }
    #updateDurableMessages(enabled) {
        if (enabled) {
            void this.#networkAgent.invoke_configureDurableMessages({
                maxTotalBufferSize: MAX_RESPONSE_BODY_TOTAL_BUFFER_LENGTH,
            });
        }
        else {
            void this.#networkAgent.invoke_configureDurableMessages({});
        }
    }
    dispose() {
        const settings = this.target().targetManager().settings;
        settings.resolve(cacheDisabledSettingDescriptor).removeChangeListener(this.cacheDisabledSettingChanged, this);
        settings.resolve(preserveNetworkLogSettingDescriptor).removeChangeListener(this.preserveLogChanged, this);
        this.#bypassServiceWorkerSetting.removeChangeListener(this.bypassServiceWorkerChanged, this);
    }
    bypassServiceWorkerChanged() {
        void this.#networkAgent.invoke_setBypassServiceWorker({ bypass: this.#bypassServiceWorkerSetting.get() });
    }
    async getSecurityIsolationStatus(frameId) {
        const result = await this.#networkAgent.invoke_getSecurityIsolationStatus({ frameId: frameId ?? undefined });
        if (result.getError()) {
            return null;
        }
        return result.status;
    }
    async enableReportingApi(enable = true) {
        return await this.#networkAgent.invoke_enableReportingApi({ enable });
    }
    async enableDeviceBoundSessions(enable = true) {
        return await this.#networkAgent.invoke_enableDeviceBoundSessions({ enable });
    }
    async deleteDeviceBoundSession(key) {
        return await this.#networkAgent.invoke_deleteDeviceBoundSession({ key });
    }
    async loadNetworkResource(frameId, url, options) {
        const result = await this.#networkAgent.invoke_loadNetworkResource({ frameId: frameId ?? undefined, url, options });
        if (result.getError()) {
            throw new Error(result.getError());
        }
        return result.resource;
    }
    clearRequests() {
        this.dispatcher.clearRequests();
    }
}
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["RequestStarted"] = "RequestStarted";
    Events["RequestUpdated"] = "RequestUpdated";
    Events["RequestFinished"] = "RequestFinished";
    Events["RequestUpdateDropped"] = "RequestUpdateDropped";
    Events["ResponseReceived"] = "ResponseReceived";
    Events["MessageGenerated"] = "MessageGenerated";
    Events["RequestRedirected"] = "RequestRedirected";
    Events["LoadingFinished"] = "LoadingFinished";
    Events["ReportingApiReportAdded"] = "ReportingApiReportAdded";
    Events["ReportingApiReportUpdated"] = "ReportingApiReportUpdated";
    Events["ReportingApiEndpointsChangedForOrigin"] = "ReportingApiEndpointsChangedForOrigin";
    Events["DeviceBoundSessionsAdded"] = "DeviceBoundSessionsAdded";
    Events["DeviceBoundSessionEventOccurred"] = "DeviceBoundSessionEventOccurred";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
/**
 * Define some built-in DevTools throttling presets.
 * Note that for the download, upload and RTT values we multiply them by adjustment factors to make DevTools' emulation more accurate.
 * @see https://docs.google.com/document/d/10lfVdS1iDWCRKQXPfbxEn4Or99D64mvNlugP1AQuFlE/edit for historical context.
 * @see https://crbug.com/342406608#comment10 for context around the addition of 4G presets in June 2024.
 */
export const BlockingConditions = {
    key: "BLOCKING" /* PredefinedThrottlingConditionKey.BLOCKING */,
    block: true,
    title: i18nLazyString(UIStrings.block),
};
export const NoThrottlingConditions = {
    key: "NO_THROTTLING" /* PredefinedThrottlingConditionKey.NO_THROTTLING */,
    title: i18nLazyString(UIStrings.noThrottling),
    i18nTitleKey: UIStrings.noThrottling,
    download: -1,
    upload: -1,
    latency: 0,
};
export const OfflineConditions = {
    key: "OFFLINE" /* PredefinedThrottlingConditionKey.OFFLINE */,
    title: i18nLazyString(UIStrings.offline),
    i18nTitleKey: UIStrings.offline,
    download: 0,
    upload: 0,
    latency: 0,
};
const slow3GTargetLatency = 400;
export const Slow3GConditions = {
    key: "SPEED_3G" /* PredefinedThrottlingConditionKey.SPEED_3G */,
    title: i18nLazyString(UIStrings.slowG),
    i18nTitleKey: UIStrings.slowG,
    // ~500Kbps down
    download: 500 * 1000 / 8 * .8,
    // ~500Kbps up
    upload: 500 * 1000 / 8 * .8,
    // 400ms RTT
    latency: slow3GTargetLatency * 5,
    targetLatency: slow3GTargetLatency,
};
// Note for readers: this used to be called "Fast 3G" but it was renamed in May
// 2024 to align with LH (crbug.com/342406608).
const slow4GTargetLatency = 150;
export const Slow4GConditions = {
    key: "SPEED_SLOW_4G" /* PredefinedThrottlingConditionKey.SPEED_SLOW_4G */,
    title: i18nLazyString(UIStrings.fastG),
    i18nTitleKey: UIStrings.fastG,
    // ~1.6 Mbps down
    download: 1.6 * 1000 * 1000 / 8 * .9,
    // ~0.75 Mbps up
    upload: 750 * 1000 / 8 * .9,
    // 150ms RTT
    latency: slow4GTargetLatency * 3.75,
    targetLatency: slow4GTargetLatency,
};
const fast4GTargetLatency = 60;
export const Fast4GConditions = {
    key: "SPEED_FAST_4G" /* PredefinedThrottlingConditionKey.SPEED_FAST_4G */,
    title: i18nLazyString(UIStrings.fast4G),
    i18nTitleKey: UIStrings.fast4G,
    // 9 Mbps down
    download: 9 * 1000 * 1000 / 8 * .9,
    // 1.5 Mbps up
    upload: 1.5 * 1000 * 1000 / 8 * .9,
    // 60ms RTT
    latency: fast4GTargetLatency * 2.75,
    targetLatency: fast4GTargetLatency,
};
const MAX_EAGER_POST_REQUEST_BODY_LENGTH = 64 * 1024; // bytes
const MAX_RESPONSE_BODY_TOTAL_BUFFER_LENGTH = 250 * 1024 * 1024; // bytes
export class FetchDispatcher {
    #fetchAgent;
    #manager;
    #multitargetNetworkManager;
    constructor(agent, manager) {
        this.#fetchAgent = agent;
        this.#manager = manager;
        this.#multitargetNetworkManager = this.#manager.target().targetManager().getNetworkManager();
    }
    requestPaused({ requestId, request, resourceType, responseStatusCode, responseHeaders, networkId }) {
        const networkRequest = networkId ? this.#manager.requestForId(networkId) : null;
        // If there was no 'Network.responseReceivedExtraInfo' event (e.g. for 'file:/' URLSs),
        // populate 'originalResponseHeaders' with the headers from the 'Fetch.requestPaused' event.
        if (networkRequest?.originalResponseHeaders.length === 0 && responseHeaders) {
            networkRequest.originalResponseHeaders = responseHeaders;
        }
        void this.#multitargetNetworkManager.requestIntercepted(new InterceptedRequest(this.#multitargetNetworkManager, this.#fetchAgent, request, resourceType, requestId, networkRequest, responseStatusCode, responseHeaders));
    }
    authRequired({}) {
    }
}
export class NetworkDispatcher {
    #manager;
    #multitargetNetworkManager;
    #requestsById = new Map();
    #requestsByURL = new Map();
    #requestsByLoaderId = new Map();
    #requestIdToExtraInfoBuilder = new Map();
    /**
     * In case of an early abort or a cache hit, the Trust Token done event is
     * reported before the request itself is created in `requestWillBeSent`.
     * This causes the event to be lost as no `NetworkRequest` instance has been
     * created yet.
     * This map caches the events temporarily and populates the NetworkRequest
     * once it is created in `requestWillBeSent`.
     */
    #requestIdToTrustTokenEvent = new Map();
    constructor(manager) {
        this.#manager = manager;
        this.#multitargetNetworkManager = this.#manager.target().targetManager().getNetworkManager();
        this.#multitargetNetworkManager.addEventListener("RequestIntercepted" /* MultitargetNetworkManager.Events.REQUEST_INTERCEPTED */, this.#markAsIntercepted.bind(this));
    }
    #markAsIntercepted(event) {
        const request = this.requestForId(event.data);
        if (request) {
            request.setWasIntercepted(true);
        }
    }
    headersMapToHeadersArray(headersMap) {
        const result = [];
        for (const name in headersMap) {
            const values = headersMap[name].split('\n');
            for (let i = 0; i < values.length; ++i) {
                result.push({ name, value: values[i] });
            }
        }
        return result;
    }
    updateNetworkRequestWithRequest(networkRequest, request) {
        networkRequest.requestMethod = request.method;
        networkRequest.setRequestHeaders(this.headersMapToHeadersArray(request.headers));
        // If the request body is compressed, discard the inline postData which is
        // garbled (binary-as-text). The getRequestPostData command will provide
        // properly base64-encoded data that we can decompress.
        const isCompressed = Boolean(networkRequest.requestContentEncoding());
        networkRequest.setRequestFormData(Boolean(request.hasPostData), isCompressed ? null : (request.postData || null));
        networkRequest.setInitialPriority(request.initialPriority);
        networkRequest.mixedContentType = request.mixedContentType || "none" /* Protocol.Security.MixedContentType.None */;
        networkRequest.setReferrerPolicy(request.referrerPolicy);
        networkRequest.setIsSameSite(request.isSameSite || false);
        networkRequest.setIsAdRelated(request.isAdRelated || false);
        networkRequest.setIsLinkPreload(request.isLinkPreload || false);
    }
    updateNetworkRequestWithResponse(networkRequest, response) {
        if (response.url && networkRequest.url() !== response.url) {
            networkRequest.setUrl(response.url);
        }
        networkRequest.mimeType = response.mimeType;
        networkRequest.setCharset(response.charset);
        if (!networkRequest.statusCode || networkRequest.wasIntercepted()) {
            networkRequest.statusCode = response.status;
        }
        if (!networkRequest.statusText || networkRequest.wasIntercepted()) {
            networkRequest.statusText = response.statusText;
        }
        if (!networkRequest.hasExtraResponseInfo() || networkRequest.wasIntercepted()) {
            networkRequest.responseHeaders = this.headersMapToHeadersArray(response.headers);
        }
        if (response.encodedDataLength >= 0) {
            networkRequest.setTransferSize(response.encodedDataLength);
        }
        if (response.requestHeaders && !networkRequest.hasExtraRequestInfo()) {
            // TODO(http://crbug.com/1004979): Stop using response.requestHeaders and
            //   response.requestHeadersText once shared workers
            //   emit Network.*ExtraInfo events for their network #requests.
            networkRequest.setRequestHeaders(this.headersMapToHeadersArray(response.requestHeaders));
            networkRequest.setRequestHeadersText(response.requestHeadersText || '');
        }
        networkRequest.connectionReused = response.connectionReused;
        networkRequest.connectionId = String(response.connectionId);
        if (response.remoteIPAddress) {
            networkRequest.setRemoteAddress(response.remoteIPAddress, response.remotePort || -1);
        }
        if (response.fromServiceWorker) {
            networkRequest.fetchedViaServiceWorker = true;
        }
        if (response.fromDiskCache) {
            networkRequest.setFromDiskCache();
        }
        if (response.fromPrefetchCache) {
            networkRequest.setFromPrefetchCache();
        }
        if (response.fromEarlyHints) {
            networkRequest.setFromEarlyHints();
        }
        if (response.cacheStorageCacheName) {
            networkRequest.setResponseCacheStorageCacheName(response.cacheStorageCacheName);
        }
        if (response.serviceWorkerRouterInfo) {
            networkRequest.serviceWorkerRouterInfo = response.serviceWorkerRouterInfo;
        }
        if (response.responseTime) {
            networkRequest.setResponseRetrievalTime(new Date(response.responseTime));
        }
        networkRequest.timing = response.timing;
        networkRequest.protocol = response.protocol || '';
        networkRequest.alternateProtocolUsage = response.alternateProtocolUsage;
        if (response.serviceWorkerResponseSource) {
            networkRequest.setServiceWorkerResponseSource(response.serviceWorkerResponseSource);
        }
        networkRequest.setSecurityState(response.securityState);
        if (response.securityDetails) {
            networkRequest.setSecurityDetails(response.securityDetails);
        }
        const newResourceType = Common.ResourceType.ResourceType.fromMimeTypeOverride(networkRequest.mimeType);
        if (newResourceType) {
            networkRequest.setResourceType(newResourceType);
        }
        if (networkRequest.responseReceivedPromiseResolve) {
            // Anyone interested in waiting for response headers being available?
            networkRequest.responseReceivedPromiseResolve();
        }
        else {
            // If not, make sure no one will wait on it in the future.
            networkRequest.responseReceivedPromise = Promise.resolve();
        }
    }
    requestForId(id) {
        return this.#requestsById.get(id) || null;
    }
    requestForURL(url) {
        return this.#requestsByURL.get(url) || null;
    }
    requestForLoaderId(loaderId) {
        return this.#requestsByLoaderId.get(loaderId) || null;
    }
    resourceChangedPriority({ requestId, newPriority }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (networkRequest) {
            networkRequest.setPriority(newPriority);
        }
    }
    signedExchangeReceived({ requestId, info }) {
        // While loading a signed exchange, a signedExchangeReceived event is sent
        // between two requestWillBeSent events.
        // 1. The first requestWillBeSent is sent while starting the navigation (or
        //    prefetching).
        // 2. This signedExchangeReceived event is sent when the browser detects the
        //    signed exchange.
        // 3. The second requestWillBeSent is sent with the generated redirect
        //    response and a new redirected request which URL is the inner request
        //    URL of the signed exchange.
        let networkRequest = this.#requestsById.get(requestId);
        // |requestId| is available only for navigation #requests. If the request was
        // sent from a renderer process for prefetching, it is not available. In the
        // case, need to fallback to look for the URL.
        // TODO(crbug/841076): Sends the request ID of prefetching to the browser
        // process and DevTools to find the matching request.
        if (!networkRequest) {
            networkRequest = this.#requestsByURL.get(info.outerResponse.url);
            if (!networkRequest) {
                return;
            }
            // Or clause is never hit, but is here because we can't use non-null assertions.
            const backendRequestId = networkRequest.backendRequestId() || requestId;
            requestId = backendRequestId;
        }
        networkRequest.setSignedExchangeInfo(info);
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.SignedExchange);
        this.updateNetworkRequestWithResponse(networkRequest, info.outerResponse);
        this.updateNetworkRequest(networkRequest);
        this.getExtraInfoBuilder(requestId).addHasExtraInfo(info.hasExtraInfo);
        this.#manager.dispatchEventToListeners(Events.ResponseReceived, { request: networkRequest, response: info.outerResponse });
    }
    requestWillBeSent({ requestId, loaderId, documentURL, request, timestamp, wallTime, initiator, redirectHasExtraInfo, redirectResponse, type, frameId, hasUserGesture, renderBlockingBehavior, }) {
        let networkRequest = this.#requestsById.get(requestId);
        if (networkRequest) {
            // FIXME: move this check to the backend.
            if (!redirectResponse) {
                return;
            }
            // If signedExchangeReceived event has already been sent for the request,
            // ignores the internally generated |redirectResponse|. The
            // |outerResponse| of SignedExchangeInfo was set to |networkRequest| in
            // signedExchangeReceived().
            if (!networkRequest.signedExchangeInfo()) {
                this.responseReceived({
                    requestId,
                    loaderId,
                    timestamp,
                    type: type || "Other" /* Protocol.Network.ResourceType.Other */,
                    response: redirectResponse,
                    hasExtraInfo: redirectHasExtraInfo,
                    frameId,
                });
            }
            networkRequest = this.appendRedirect(requestId, timestamp, request.url);
            this.#manager.dispatchEventToListeners(Events.RequestRedirected, networkRequest);
        }
        else {
            networkRequest = NetworkRequest.create(requestId, request.url, documentURL, frameId ?? null, loaderId, initiator, hasUserGesture, this.#manager.target().targetManager().getConsole());
            if (renderBlockingBehavior) {
                networkRequest.setRenderBlockingBehavior(renderBlockingBehavior);
            }
            requestToManagerMap.set(networkRequest, this.#manager);
        }
        networkRequest.setCacheDisabled(this.#manager.target().targetManager().settings.resolve(cacheDisabledSettingDescriptor).get());
        networkRequest.hasNetworkData = true;
        this.updateNetworkRequestWithRequest(networkRequest, request);
        networkRequest.setIssueTime(timestamp, wallTime);
        networkRequest.setResourceType(type ? Common.ResourceType.resourceTypes[type] : Common.ResourceType.resourceTypes.Other);
        if (request.trustTokenParams) {
            networkRequest.setTrustTokenParams(request.trustTokenParams);
        }
        const maybeTrustTokenEvent = this.#requestIdToTrustTokenEvent.get(requestId);
        if (maybeTrustTokenEvent) {
            networkRequest.setTrustTokenOperationDoneEvent(maybeTrustTokenEvent);
            this.#requestIdToTrustTokenEvent.delete(requestId);
        }
        this.getExtraInfoBuilder(requestId).addRequest(networkRequest);
        this.startNetworkRequest(networkRequest, request);
    }
    requestServedFromCache({ requestId }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.setFromMemoryCache();
    }
    responseReceived({ requestId, loaderId, timestamp, type, response, hasExtraInfo, frameId }) {
        const networkRequest = this.#requestsById.get(requestId);
        const lowercaseHeaders = NetworkManager.lowercaseHeaders(response.headers);
        if (!networkRequest) {
            const lastModifiedHeader = lowercaseHeaders['last-modified'];
            // We missed the requestWillBeSent.
            const eventData = {
                url: response.url,
                frameId: frameId ?? null,
                loaderId,
                resourceType: type,
                mimeType: response.mimeType,
                lastModified: lastModifiedHeader ? new Date(lastModifiedHeader) : null,
            };
            this.#manager.dispatchEventToListeners(Events.RequestUpdateDropped, eventData);
            return;
        }
        networkRequest.responseReceivedTime = timestamp;
        networkRequest.setResourceType(Common.ResourceType.resourceTypes[type]);
        this.updateNetworkRequestWithResponse(networkRequest, response);
        this.updateNetworkRequest(networkRequest);
        this.getExtraInfoBuilder(requestId).addHasExtraInfo(hasExtraInfo);
        this.#manager.dispatchEventToListeners(Events.ResponseReceived, { request: networkRequest, response });
    }
    dataReceived(event) {
        let networkRequest = this.#requestsById.get(event.requestId);
        if (!networkRequest) {
            networkRequest = this.maybeAdoptMainResourceRequest(event.requestId);
        }
        if (!networkRequest) {
            return;
        }
        networkRequest.addDataReceivedEvent(event);
        this.updateNetworkRequest(networkRequest);
    }
    loadingFinished({ requestId, timestamp: finishTime, encodedDataLength }) {
        let networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            networkRequest = this.maybeAdoptMainResourceRequest(requestId);
        }
        if (!networkRequest) {
            return;
        }
        this.getExtraInfoBuilder(requestId).finished();
        this.finishNetworkRequest(networkRequest, finishTime, encodedDataLength);
        this.#manager.dispatchEventToListeners(Events.LoadingFinished, networkRequest);
    }
    loadingFailed({ requestId, timestamp: time, type: resourceType, errorText: localizedDescription, canceled, blockedReason, corsErrorStatus, }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.failed = true;
        networkRequest.setResourceType(Common.ResourceType.resourceTypes[resourceType]);
        networkRequest.canceled = Boolean(canceled);
        if (blockedReason) {
            networkRequest.setBlockedReason(blockedReason);
            if (blockedReason === "inspector" /* Protocol.Network.BlockedReason.Inspector */) {
                const message = i18nString(UIStrings.requestWasBlockedByDevtoolsS, { PH1: networkRequest.url() });
                this.#manager.dispatchEventToListeners(Events.MessageGenerated, { message, requestId, warning: true });
            }
        }
        if (corsErrorStatus) {
            networkRequest.setCorsErrorStatus(corsErrorStatus);
        }
        networkRequest.localizedFailDescription = localizedDescription;
        this.getExtraInfoBuilder(requestId).finished();
        this.finishNetworkRequest(networkRequest, time, -1);
    }
    webSocketCreated({ requestId, url: requestURL, initiator }) {
        const networkRequest = NetworkRequest.createForSocket(requestId, requestURL, initiator, this.#manager.target().targetManager().getConsole());
        requestToManagerMap.set(networkRequest, this.#manager);
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.WebSocket);
        this.startNetworkRequest(networkRequest, null);
    }
    webSocketWillSendHandshakeRequest({ requestId, timestamp: time, wallTime, request }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.requestMethod = 'GET';
        networkRequest.setRequestHeaders(this.headersMapToHeadersArray(request.headers));
        networkRequest.setIssueTime(time, wallTime);
        this.updateNetworkRequest(networkRequest);
    }
    webSocketHandshakeResponseReceived({ requestId, timestamp: time, response }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.statusCode = response.status;
        networkRequest.statusText = response.statusText;
        networkRequest.responseHeaders = this.headersMapToHeadersArray(response.headers);
        networkRequest.responseHeadersText = response.headersText || '';
        if (response.requestHeaders) {
            networkRequest.setRequestHeaders(this.headersMapToHeadersArray(response.requestHeaders));
        }
        if (response.requestHeadersText) {
            networkRequest.setRequestHeadersText(response.requestHeadersText);
        }
        networkRequest.responseReceivedTime = time;
        networkRequest.protocol = 'websocket';
        this.updateNetworkRequest(networkRequest);
    }
    webSocketFrameReceived({ requestId, timestamp: time, response }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addProtocolFrame(response, time, false);
        networkRequest.responseReceivedTime = time;
        this.updateNetworkRequest(networkRequest);
    }
    webSocketFrameSent({ requestId, timestamp: time, response }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addProtocolFrame(response, time, true);
        networkRequest.responseReceivedTime = time;
        this.updateNetworkRequest(networkRequest);
    }
    webSocketFrameError({ requestId, timestamp: time, errorMessage }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addProtocolFrameError(errorMessage, time);
        networkRequest.responseReceivedTime = time;
        this.updateNetworkRequest(networkRequest);
    }
    webSocketClosed({ requestId, timestamp: time }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        this.finishNetworkRequest(networkRequest, time, -1);
    }
    eventSourceMessageReceived({ requestId, timestamp: time, eventName, eventId, data }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addEventSourceMessage(time, eventName, eventId, data);
    }
    requestWillBeSentExtraInfo({ requestId, associatedCookies, headers, deviceBoundSessionUsages, clientSecurityState, connectTiming, siteHasCookieInOtherPartition, appliedNetworkConditionsId, }) {
        const blockedRequestCookies = [];
        const includedRequestCookies = [];
        for (const { blockedReasons, exemptionReason, cookie } of associatedCookies) {
            if (blockedReasons.length === 0) {
                includedRequestCookies.push({ exemptionReason, cookie: Cookie.fromProtocolCookie(cookie) });
            }
            else {
                blockedRequestCookies.push({ blockedReasons, cookie: Cookie.fromProtocolCookie(cookie) });
            }
        }
        const extraRequestInfo = {
            blockedRequestCookies,
            includedRequestCookies,
            requestHeaders: this.headersMapToHeadersArray(headers),
            deviceBoundSessionUsages,
            clientSecurityState,
            connectTiming,
            siteHasCookieInOtherPartition,
            appliedNetworkConditionsId,
        };
        this.getExtraInfoBuilder(requestId).addRequestExtraInfo(extraRequestInfo);
        const networkRequest = this.#requestsById.get(requestId);
        if (appliedNetworkConditionsId && networkRequest) {
            networkRequest.setAppliedNetworkConditions(appliedNetworkConditionsId);
            this.updateNetworkRequest(networkRequest);
        }
    }
    responseReceivedEarlyHints({ requestId, headers, }) {
        this.getExtraInfoBuilder(requestId).setEarlyHintsHeaders(this.headersMapToHeadersArray(headers));
    }
    responseReceivedExtraInfo({ requestId, blockedCookies, headers, headersText, resourceIPAddressSpace, statusCode, cookiePartitionKey, cookiePartitionKeyOpaque, exemptedCookies, }) {
        const extraResponseInfo = {
            blockedResponseCookies: blockedCookies.map(blockedCookie => ({
                blockedReasons: blockedCookie.blockedReasons,
                cookieLine: blockedCookie.cookieLine,
                cookie: blockedCookie.cookie ? Cookie.fromProtocolCookie(blockedCookie.cookie) : null,
            })),
            responseHeaders: this.headersMapToHeadersArray(headers),
            responseHeadersText: headersText,
            resourceIPAddressSpace,
            statusCode,
            cookiePartitionKey,
            cookiePartitionKeyOpaque,
            exemptedResponseCookies: exemptedCookies?.map(exemptedCookie => ({
                cookie: Cookie.fromProtocolCookie(exemptedCookie.cookie),
                cookieLine: exemptedCookie.cookieLine,
                exemptionReason: exemptedCookie.exemptionReason,
            })),
        };
        this.getExtraInfoBuilder(requestId).addResponseExtraInfo(extraResponseInfo);
    }
    getExtraInfoBuilder(requestId) {
        let builder;
        if (!this.#requestIdToExtraInfoBuilder.has(requestId)) {
            builder = new ExtraInfoBuilder();
            this.#requestIdToExtraInfoBuilder.set(requestId, builder);
        }
        else {
            builder = this.#requestIdToExtraInfoBuilder.get(requestId);
        }
        return builder;
    }
    appendRedirect(requestId, time, redirectURL) {
        const originalNetworkRequest = this.#requestsById.get(requestId);
        if (!originalNetworkRequest) {
            throw new Error(`Could not find original network request for ${requestId}`);
        }
        let redirectCount = 0;
        for (let redirect = originalNetworkRequest.redirectSource(); redirect; redirect = redirect.redirectSource()) {
            redirectCount++;
        }
        originalNetworkRequest.markAsRedirect(redirectCount);
        this.finishNetworkRequest(originalNetworkRequest, time, -1);
        const newNetworkRequest = NetworkRequest.create(requestId, redirectURL, originalNetworkRequest.documentURL, originalNetworkRequest.frameId, originalNetworkRequest.loaderId, originalNetworkRequest.initiator(), originalNetworkRequest.hasUserGesture() ?? undefined, this.#manager.target().targetManager().getConsole());
        requestToManagerMap.set(newNetworkRequest, this.#manager);
        newNetworkRequest.setRedirectSource(originalNetworkRequest);
        originalNetworkRequest.setRedirectDestination(newNetworkRequest);
        return newNetworkRequest;
    }
    maybeAdoptMainResourceRequest(requestId) {
        const request = this.#multitargetNetworkManager.inflightMainResourceRequests.get(requestId);
        if (!request) {
            return null;
        }
        const oldDispatcher = NetworkManager.forRequest(request).dispatcher;
        oldDispatcher.#requestsById.delete(requestId);
        oldDispatcher.#requestsByURL.delete(request.url());
        const loaderId = request.loaderId;
        if (loaderId) {
            oldDispatcher.#requestsByLoaderId.delete(loaderId);
        }
        const builder = oldDispatcher.#requestIdToExtraInfoBuilder.get(requestId);
        oldDispatcher.#requestIdToExtraInfoBuilder.delete(requestId);
        this.#requestsById.set(requestId, request);
        this.#requestsByURL.set(request.url(), request);
        if (loaderId) {
            this.#requestsByLoaderId.set(loaderId, request);
        }
        if (builder) {
            this.#requestIdToExtraInfoBuilder.set(requestId, builder);
        }
        requestToManagerMap.set(request, this.#manager);
        return request;
    }
    startNetworkRequest(networkRequest, originalRequest) {
        this.#requestsById.set(networkRequest.requestId(), networkRequest);
        this.#requestsByURL.set(networkRequest.url(), networkRequest);
        const loaderId = networkRequest.loaderId;
        if (loaderId) {
            this.#requestsByLoaderId.set(loaderId, networkRequest);
        }
        // The following relies on the fact that loaderIds and requestIds
        // are globally unique and that the main request has them equal. If
        // loaderId is an empty string, it indicates a worker request. For the
        // request to fetch the main worker script, the request ID is the future
        // worker target ID and, therefore, it is unique.
        if (networkRequest.loaderId === networkRequest.requestId() || networkRequest.loaderId === '') {
            this.#multitargetNetworkManager.inflightMainResourceRequests.set(networkRequest.requestId(), networkRequest);
        }
        this.#manager.dispatchEventToListeners(Events.RequestStarted, { request: networkRequest, originalRequest });
    }
    updateNetworkRequest(networkRequest) {
        this.#manager.dispatchEventToListeners(Events.RequestUpdated, networkRequest);
    }
    finishNetworkRequest(networkRequest, finishTime, encodedDataLength) {
        networkRequest.endTime = finishTime;
        networkRequest.finished = true;
        if (encodedDataLength >= 0) {
            const redirectSource = networkRequest.redirectSource();
            if (redirectSource?.signedExchangeInfo()) {
                networkRequest.setTransferSize(0);
                redirectSource.setTransferSize(encodedDataLength);
                this.updateNetworkRequest(redirectSource);
            }
            else {
                networkRequest.setTransferSize(encodedDataLength);
            }
        }
        this.#manager.dispatchEventToListeners(Events.RequestFinished, networkRequest);
        this.#multitargetNetworkManager.inflightMainResourceRequests.delete(networkRequest.requestId());
        const settings = this.#manager.target().targetManager().settings;
        if (settings.resolve(monitoringXHREnabledSettingDescriptor).get() &&
            networkRequest.resourceType().category() === Common.ResourceType.resourceCategories.XHR) {
            let message;
            const failedToLoad = networkRequest.failed || networkRequest.hasErrorStatusCode();
            if (failedToLoad) {
                message = i18nString(UIStrings.sFailedLoadingSS, { PH1: networkRequest.resourceType().title(), PH2: networkRequest.requestMethod, PH3: networkRequest.url() });
            }
            else {
                message = i18nString(UIStrings.sFinishedLoadingSS, { PH1: networkRequest.resourceType().title(), PH2: networkRequest.requestMethod, PH3: networkRequest.url() });
            }
            this.#manager.dispatchEventToListeners(Events.MessageGenerated, { message, requestId: networkRequest.requestId(), warning: false });
        }
    }
    clearRequests() {
        for (const [requestId, request] of this.#requestsById) {
            if (request.finished) {
                this.#requestsById.delete(requestId);
            }
        }
        for (const [requestURL, request] of this.#requestsByURL) {
            if (request.finished) {
                this.#requestsByURL.delete(requestURL);
            }
        }
        for (const [requestLoaderId, request] of this.#requestsByLoaderId) {
            if (request.finished) {
                this.#requestsByLoaderId.delete(requestLoaderId);
            }
        }
        for (const [requestId, builder] of this.#requestIdToExtraInfoBuilder) {
            if (builder.isFinished()) {
                this.#requestIdToExtraInfoBuilder.delete(requestId);
            }
        }
    }
    webTransportCreated({ transportId, url: requestURL, timestamp: time, initiator }) {
        const networkRequest = NetworkRequest.createForSocket(transportId, requestURL, initiator, this.#manager.target().targetManager().getConsole());
        networkRequest.hasNetworkData = true;
        requestToManagerMap.set(networkRequest, this.#manager);
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.WebTransport);
        networkRequest.setIssueTime(time, 0);
        // TODO(yoichio): Add appropreate events to address abort cases.
        this.startNetworkRequest(networkRequest, null);
    }
    webTransportConnectionEstablished({ transportId, timestamp: time }) {
        const networkRequest = this.#requestsById.get(transportId);
        if (!networkRequest) {
            return;
        }
        // This dummy deltas are needed to show this request as being
        // downloaded(blue) given typical WebTransport is kept for a while.
        // TODO(yoichio): Add appropreate events to fix these dummy datas.
        // DNS lookup?
        networkRequest.responseReceivedTime = time;
        networkRequest.endTime = time + 0.001;
        this.updateNetworkRequest(networkRequest);
    }
    webTransportClosed({ transportId, timestamp: time }) {
        const networkRequest = this.#requestsById.get(transportId);
        if (!networkRequest) {
            return;
        }
        networkRequest.endTime = time;
        this.finishNetworkRequest(networkRequest, time, 0);
    }
    directTCPSocketCreated(event) {
        const requestURL = this.concatHostPort(event.remoteAddr, event.remotePort);
        const networkRequest = NetworkRequest.createForSocket(event.identifier, requestURL, event.initiator, this.#manager.target().targetManager().getConsole());
        networkRequest.hasNetworkData = true;
        networkRequest.setRemoteAddress(event.remoteAddr, event.remotePort);
        networkRequest.protocol = i18n.i18n.lockedString('tcp');
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusOpening);
        networkRequest.directSocketInfo = {
            type: DirectSocketType.TCP,
            status: DirectSocketStatus.OPENING,
            createOptions: {
                remoteAddr: event.remoteAddr,
                remotePort: event.remotePort,
                noDelay: event.options.noDelay,
                keepAliveDelay: event.options.keepAliveDelay,
                sendBufferSize: event.options.sendBufferSize,
                receiveBufferSize: event.options.receiveBufferSize,
                dnsQueryType: event.options.dnsQueryType,
            },
        };
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.DirectSocket);
        networkRequest.setIssueTime(event.timestamp, event.timestamp);
        requestToManagerMap.set(networkRequest, this.#manager);
        this.startNetworkRequest(networkRequest, null);
    }
    directTCPSocketOpened(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo) {
            return;
        }
        networkRequest.responseReceivedTime = event.timestamp;
        networkRequest.directSocketInfo.status = DirectSocketStatus.OPEN;
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusOpen);
        networkRequest.directSocketInfo.openInfo = {
            remoteAddr: event.remoteAddr,
            remotePort: event.remotePort,
            localAddr: event.localAddr,
            localPort: event.localPort,
        };
        networkRequest.setRemoteAddress(event.remoteAddr, event.remotePort);
        const requestURL = this.concatHostPort(event.remoteAddr, event.remotePort);
        networkRequest.setUrl(requestURL);
        this.updateNetworkRequest(networkRequest);
    }
    directTCPSocketAborted(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo) {
            return;
        }
        networkRequest.failed = true;
        networkRequest.directSocketInfo.status = DirectSocketStatus.ABORTED;
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusAborted);
        networkRequest.directSocketInfo.errorMessage = event.errorMessage;
        this.finishNetworkRequest(networkRequest, event.timestamp, 0);
    }
    directTCPSocketClosed(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo) {
            return;
        }
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusClosed);
        networkRequest.directSocketInfo.status = DirectSocketStatus.CLOSED;
        this.finishNetworkRequest(networkRequest, event.timestamp, 0);
    }
    directTCPSocketChunkSent(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest) {
            return;
        }
        networkRequest.addDirectSocketChunk({
            data: event.data,
            type: DirectSocketChunkType.SEND,
            timestamp: event.timestamp,
        });
        networkRequest.responseReceivedTime = event.timestamp;
        this.updateNetworkRequest(networkRequest);
    }
    directTCPSocketChunkReceived(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest) {
            return;
        }
        networkRequest.addDirectSocketChunk({
            data: event.data,
            type: DirectSocketChunkType.RECEIVE,
            timestamp: event.timestamp,
        });
        networkRequest.responseReceivedTime = event.timestamp;
        this.updateNetworkRequest(networkRequest);
    }
    directUDPSocketCreated(event) {
        let requestURL = '';
        let type;
        if (event.options.remoteAddr && event.options.remotePort) {
            requestURL = this.concatHostPort(event.options.remoteAddr, event.options.remotePort);
            type = DirectSocketType.UDP_CONNECTED;
        }
        else if (event.options.localAddr) {
            requestURL = this.concatHostPort(event.options.localAddr, event.options.localPort);
            type = DirectSocketType.UDP_BOUND;
        }
        else {
            // Must be present in a valid command if remoteAddr
            // is not specified.
            return;
        }
        const networkRequest = NetworkRequest.createForSocket(event.identifier, requestURL, event.initiator, this.#manager.target().targetManager().getConsole());
        networkRequest.hasNetworkData = true;
        if (event.options.remoteAddr && event.options.remotePort) {
            networkRequest.setRemoteAddress(event.options.remoteAddr, event.options.remotePort);
        }
        networkRequest.protocol = i18n.i18n.lockedString('udp');
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusOpening);
        networkRequest.directSocketInfo = {
            type,
            status: DirectSocketStatus.OPENING,
            createOptions: {
                remoteAddr: event.options.remoteAddr,
                remotePort: event.options.remotePort,
                localAddr: event.options.localAddr,
                localPort: event.options.localPort,
                sendBufferSize: event.options.sendBufferSize,
                receiveBufferSize: event.options.receiveBufferSize,
                dnsQueryType: event.options.dnsQueryType,
                multicastLoopback: event.options.multicastLoopback,
                multicastTimeToLive: event.options.multicastTimeToLive,
                multicastAllowAddressSharing: event.options.multicastAllowAddressSharing,
            },
            joinedMulticastGroups: new Set(),
        };
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.DirectSocket);
        networkRequest.setIssueTime(event.timestamp, event.timestamp);
        requestToManagerMap.set(networkRequest, this.#manager);
        this.startNetworkRequest(networkRequest, null);
    }
    directUDPSocketOpened(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo) {
            return;
        }
        let requestURL;
        if (networkRequest.directSocketInfo.type === DirectSocketType.UDP_CONNECTED) {
            if (!event.remoteAddr || !event.remotePort) {
                // Connected socket must have remoteAdd and remotePort.
                return;
            }
            networkRequest.setRemoteAddress(event.remoteAddr, event.remotePort);
            requestURL = this.concatHostPort(event.remoteAddr, event.remotePort);
        }
        else {
            requestURL = this.concatHostPort(event.localAddr, event.localPort);
        }
        networkRequest.setUrl(requestURL);
        networkRequest.responseReceivedTime = event.timestamp;
        networkRequest.directSocketInfo.status = DirectSocketStatus.OPEN;
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusOpen);
        networkRequest.directSocketInfo.openInfo = {
            remoteAddr: event.remoteAddr,
            remotePort: event.remotePort,
            localAddr: event.localAddr,
            localPort: event.localPort,
        };
        this.updateNetworkRequest(networkRequest);
    }
    directUDPSocketAborted(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo) {
            return;
        }
        networkRequest.failed = true;
        networkRequest.directSocketInfo.status = DirectSocketStatus.ABORTED;
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusAborted);
        networkRequest.directSocketInfo.errorMessage = event.errorMessage;
        this.finishNetworkRequest(networkRequest, event.timestamp, 0);
    }
    directUDPSocketClosed(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo) {
            return;
        }
        networkRequest.statusText = i18nString(UIStrings.directSocketStatusClosed);
        networkRequest.directSocketInfo.status = DirectSocketStatus.CLOSED;
        this.finishNetworkRequest(networkRequest, event.timestamp, 0);
    }
    directUDPSocketChunkSent(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest) {
            return;
        }
        networkRequest.addDirectSocketChunk({
            data: event.message.data,
            type: DirectSocketChunkType.SEND,
            timestamp: event.timestamp,
            remoteAddress: event.message.remoteAddr,
            remotePort: event.message.remotePort,
        });
        networkRequest.responseReceivedTime = event.timestamp;
        this.updateNetworkRequest(networkRequest);
    }
    directUDPSocketChunkReceived(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest) {
            return;
        }
        networkRequest.addDirectSocketChunk({
            data: event.message.data,
            type: DirectSocketChunkType.RECEIVE,
            timestamp: event.timestamp,
            remoteAddress: event.message.remoteAddr,
            remotePort: event.message.remotePort,
        });
        networkRequest.responseReceivedTime = event.timestamp;
        this.updateNetworkRequest(networkRequest);
    }
    directUDPSocketJoinedMulticastGroup(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo) {
            return;
        }
        if (!networkRequest.directSocketInfo.joinedMulticastGroups) {
            networkRequest.directSocketInfo.joinedMulticastGroups = new Set();
        }
        if (!networkRequest.directSocketInfo.joinedMulticastGroups.has(event.IPAddress)) {
            networkRequest.directSocketInfo.joinedMulticastGroups.add(event.IPAddress);
            this.updateNetworkRequest(networkRequest);
        }
    }
    directUDPSocketLeftMulticastGroup(event) {
        const networkRequest = this.#requestsById.get(event.identifier);
        if (!networkRequest?.directSocketInfo?.joinedMulticastGroups) {
            return;
        }
        if (networkRequest.directSocketInfo.joinedMulticastGroups.delete(event.IPAddress)) {
            this.updateNetworkRequest(networkRequest);
        }
    }
    trustTokenOperationDone(event) {
        const request = this.#requestsById.get(event.requestId);
        if (!request) {
            this.#requestIdToTrustTokenEvent.set(event.requestId, event);
            return;
        }
        request.setTrustTokenOperationDoneEvent(event);
    }
    reportingApiReportAdded(data) {
        this.#manager.dispatchEventToListeners(Events.ReportingApiReportAdded, data.report);
    }
    reportingApiReportUpdated(data) {
        this.#manager.dispatchEventToListeners(Events.ReportingApiReportUpdated, data.report);
    }
    reportingApiEndpointsChangedForOrigin(data) {
        this.#manager.dispatchEventToListeners(Events.ReportingApiEndpointsChangedForOrigin, data);
    }
    deviceBoundSessionsAdded(_params) {
        this.#manager.dispatchEventToListeners(Events.DeviceBoundSessionsAdded, _params.sessions);
    }
    deviceBoundSessionEventOccurred(_params) {
        this.#manager.dispatchEventToListeners(Events.DeviceBoundSessionEventOccurred, _params);
    }
    policyUpdated() {
    }
    /**
     * @deprecated
     * This method is only kept for usage in a web test.
     */
    createNetworkRequest(requestId, frameId, loaderId, url, documentURL, initiator) {
        const request = NetworkRequest.create(requestId, url, documentURL, frameId, loaderId, initiator, undefined, this.#manager.target().targetManager().getConsole());
        requestToManagerMap.set(request, this.#manager);
        return request;
    }
    concatHostPort(host, port) {
        if (!port || port === 0) {
            return host;
        }
        return `${host}:${port}`;
    }
}
export class RequestURLPattern {
    constructorString;
    pattern;
    constructor(constructorString, pattern) {
        this.constructorString = constructorString;
        this.pattern = pattern;
        if (pattern.hasRegExpGroups) {
            throw new Error('RegExp groups are not allowed');
        }
    }
    static isValidPattern(pattern) {
        try {
            const urlPattern = new URLPattern(pattern);
            return urlPattern.hasRegExpGroups ? "has-regexp-groups" /* RequestURLPatternValidity.HAS_REGEXP_GROUPS */ : "valid" /* RequestURLPatternValidity.VALID */;
        }
        catch {
            return "failed-to-parse" /* RequestURLPatternValidity.FAILED_TO_PARSE */;
        }
    }
    static create(constructorString) {
        try {
            const urlPattern = new URLPattern(constructorString);
            return urlPattern.hasRegExpGroups ? null : new RequestURLPattern(constructorString, urlPattern);
        }
        catch {
            return null;
        }
    }
    static upgradeFromWildcard(pattern) {
        const tryCreate = (constructorString) => {
            const result = this.create(constructorString);
            if (result?.pattern.protocol === 'localhost' && result?.pattern.hostname === '') {
                // localhost:1234 parses as a valid pattern, do the right thing here instead
                return tryCreate(`*://${constructorString}`);
            }
            return result;
        };
        return tryCreate(pattern) // try as is
            ??
                // Try to upgrade patterns created from the network panel, which either blocks the full url (sans
                // protocol) or just the domain name. In both cases the wildcard patterns had implicit wildcards at the end.
                // We explicitly add that here, which will match both domain names without path (implicitly setting pathname
                // to '*') and urls with path (appending * to the pathname).
                tryCreate(`*://${pattern}*`);
    }
}
export class RequestCondition extends Common.ObjectWrapper.ObjectWrapper {
    #pattern;
    #enabled;
    #conditions;
    #ruleIds = new Set();
    static createFromSetting(setting, settings) {
        if ('urlPattern' in setting) {
            const pattern = RequestURLPattern.create(setting.urlPattern) ?? {
                wildcardURL: setting.urlPattern,
                upgradedPattern: RequestURLPattern.upgradeFromWildcard(setting.urlPattern) ?? undefined,
            };
            const conditions = getPredefinedOrBlockingCondition(setting.conditions) ??
                customUserNetworkConditionsSetting(settings).get().find(condition => condition.key === setting.conditions) ??
                NoThrottlingConditions;
            return new this(pattern, setting.enabled, conditions);
        }
        const pattern = {
            wildcardURL: setting.url,
            upgradedPattern: RequestURLPattern.upgradeFromWildcard(setting.url) ?? undefined,
        };
        return new this(pattern, setting.enabled, BlockingConditions);
    }
    static create(pattern, conditions) {
        return new this(pattern, /* enabled=*/ true, conditions);
    }
    constructor(pattern, enabled, conditions) {
        super();
        this.#pattern = pattern;
        this.#enabled = enabled;
        this.#conditions = conditions;
    }
    get isBlocking() {
        return this.conditions === BlockingConditions;
    }
    get ruleIds() {
        return this.#ruleIds;
    }
    get constructorString() {
        return this.#pattern instanceof RequestURLPattern ? this.#pattern.constructorString :
            this.#pattern.upgradedPattern?.constructorString;
    }
    get wildcardURL() {
        return 'wildcardURL' in this.#pattern ? this.#pattern.wildcardURL : undefined;
    }
    get constructorStringOrWildcardURL() {
        return this.#pattern instanceof RequestURLPattern ?
            this.#pattern.constructorString :
            (this.#pattern.upgradedPattern?.constructorString ?? this.#pattern.wildcardURL);
    }
    set pattern(pattern) {
        this.#pattern = pattern;
        this.dispatchEventToListeners("request-condition-changed" /* RequestCondition.Events.REQUEST_CONDITION_CHANGED */);
    }
    get enabled() {
        return this.#enabled;
    }
    set enabled(enabled) {
        this.#enabled = enabled;
        this.dispatchEventToListeners("request-condition-changed" /* RequestCondition.Events.REQUEST_CONDITION_CHANGED */);
    }
    get conditions() {
        return this.#conditions;
    }
    set conditions(conditions) {
        this.#conditions = conditions;
        this.#ruleIds = new Set();
        this.dispatchEventToListeners("request-condition-changed" /* RequestCondition.Events.REQUEST_CONDITION_CHANGED */);
    }
    toSetting() {
        const enabled = this.enabled;
        if (this.#pattern instanceof RequestURLPattern) {
            return { enabled, urlPattern: this.#pattern.constructorString, conditions: this.#conditions.key };
        }
        if (this.#conditions !== BlockingConditions && this.#pattern.upgradedPattern) {
            return { enabled, urlPattern: this.#pattern.upgradedPattern.constructorString, conditions: this.#conditions.key };
        }
        return { enabled, url: this.#pattern.wildcardURL };
    }
    get originalOrUpgradedURLPattern() {
        return this.#pattern instanceof RequestURLPattern ? this.#pattern.pattern : this.#pattern.upgradedPattern?.pattern;
    }
}
export class RequestConditions extends Common.ObjectWrapper.ObjectWrapper {
    #setting;
    #conditionsEnabledSetting;
    #conditions = [];
    #requestConditionsById = new Map();
    #conditionsAppliedForTestPromise = Promise.resolve();
    constructor(settings) {
        super();
        this.#setting = settings.createSetting('network-blocked-patterns', []);
        this.#conditionsEnabledSetting = settings.resolve(requestBlockingEnabledSettingDescriptor);
        for (const condition of this.#setting.get()) {
            try {
                this.#conditions.push(RequestCondition.createFromSetting(condition, settings));
            }
            catch (e) {
                console.error('Error loading throttling settings: ', e);
            }
        }
        for (const condition of this.#conditions) {
            condition.addEventListener("request-condition-changed" /* RequestCondition.Events.REQUEST_CONDITION_CHANGED */, this.#conditionsChanged, this);
        }
        this.#conditionsEnabledSetting.addChangeListener(() => this.dispatchEventToListeners("request-conditions-changed" /* RequestConditions.Events.REQUEST_CONDITIONS_CHANGED */));
    }
    get count() {
        return this.#conditions.length;
    }
    get conditionsEnabled() {
        return this.#conditionsEnabledSetting.get();
    }
    set conditionsEnabled(enabled) {
        if (this.#conditionsEnabledSetting.get() === enabled) {
            return;
        }
        this.#conditionsEnabledSetting.set(enabled);
    }
    findCondition(pattern) {
        return this.#conditions.find(condition => condition.constructorString === pattern);
    }
    has(url) {
        return Boolean(this.findCondition(url));
    }
    add(...conditions) {
        this.#conditions.push(...conditions);
        for (const condition of conditions) {
            condition.addEventListener("request-condition-changed" /* RequestCondition.Events.REQUEST_CONDITION_CHANGED */, this.#conditionsChanged, this);
        }
        this.#conditionsChanged();
    }
    decreasePriority(condition) {
        const index = this.#conditions.indexOf(condition);
        if (index < 0 || index >= this.#conditions.length - 1) {
            return;
        }
        Platform.ArrayUtilities.swap(this.#conditions, index, index + 1);
        this.#conditionsChanged();
    }
    increasePriority(condition) {
        const index = this.#conditions.indexOf(condition);
        if (index <= 0) {
            return;
        }
        Platform.ArrayUtilities.swap(this.#conditions, index - 1, index);
        this.#conditionsChanged();
    }
    delete(condition) {
        const index = this.#conditions.indexOf(condition);
        if (index < 0) {
            return;
        }
        condition.removeEventListener("request-condition-changed" /* RequestCondition.Events.REQUEST_CONDITION_CHANGED */, this.#conditionsChanged, this);
        this.#conditions.splice(index, 1);
        this.#conditionsChanged();
    }
    clear() {
        this.#conditions.splice(0);
        this.#conditionsChanged();
        for (const condition of this.#conditions) {
            condition.removeEventListener("request-condition-changed" /* RequestCondition.Events.REQUEST_CONDITION_CHANGED */, this.#conditionsChanged, this);
        }
    }
    #conditionsChanged() {
        this.#setting.set(this.#conditions.map(condition => condition.toSetting()));
        this.dispatchEventToListeners("request-conditions-changed" /* RequestConditions.Events.REQUEST_CONDITIONS_CHANGED */);
    }
    get conditions() {
        return this.#conditions.values();
    }
    applyConditions(offline, globalConditions, ...agents) {
        function isNonBlockingCondition(condition) {
            return !('block' in condition);
        }
        const urlPatterns = [];
        // We store all this info out-of-band to prevent races with changing conditions while the promise is still pending
        const matchedNetworkConditions = [];
        if (this.conditionsEnabled) {
            for (const condition of this.#conditions) {
                const urlPattern = condition.constructorString;
                const conditions = condition.conditions;
                if (!condition.enabled || !urlPattern || conditions === NoThrottlingConditions) {
                    continue;
                }
                const block = !isNonBlockingCondition(conditions);
                urlPatterns.push({ urlPattern, block });
                if (!block) {
                    const { ruleIds } = condition;
                    matchedNetworkConditions.push({ ruleIds, urlPattern, conditions });
                }
            }
        }
        if (globalConditions) {
            matchedNetworkConditions.push({ conditions: globalConditions });
        }
        const promises = [];
        for (const agent of agents) {
            promises.push(agent.invoke_setBlockedURLs({ urlPatterns }));
            promises.push(agent
                .invoke_emulateNetworkConditionsByRule({
                offline,
                emulateOfflineServiceWorker: offline,
                matchedNetworkConditions: matchedNetworkConditions.map(({ urlPattern, conditions }) => ({
                    urlPattern: urlPattern ?? '',
                    latency: conditions.latency,
                    downloadThroughput: conditions.download < 0 ? 0 : conditions.download,
                    uploadThroughput: conditions.upload < 0 ? 0 : conditions.upload,
                    packetLoss: (conditions.packetLoss ?? 0) < 0 ? 0 : conditions.packetLoss,
                    packetQueueLength: conditions.packetQueueLength,
                    packetReordering: conditions.packetReordering,
                    connectionType: NetworkManager.connectionType(conditions),
                    offline,
                })),
            })
                .then(response => {
                if (!response.getError()) {
                    for (let i = 0; i < response.ruleIds.length; ++i) {
                        const ruleId = response.ruleIds[i];
                        const { ruleIds, conditions, urlPattern } = matchedNetworkConditions[i];
                        if (ruleIds) {
                            this.#requestConditionsById.set(ruleId, { urlPattern, conditions });
                            matchedNetworkConditions[i].ruleIds?.add(ruleId);
                        }
                    }
                }
            }));
            promises.push(agent.invoke_overrideNetworkState({
                offline,
                latency: globalConditions?.latency ?? 0,
                downloadThroughput: globalConditions?.download ?? -1,
                uploadThroughput: globalConditions?.upload ?? -1,
                connectionType: globalConditions ? NetworkManager.connectionType(globalConditions) : "none" /* Protocol.Network.ConnectionType.None */,
            }));
        }
        this.#conditionsAppliedForTestPromise = this.#conditionsAppliedForTestPromise.then(() => Promise.all(promises));
        return urlPatterns.length > 0;
    }
    conditionsAppliedForTest() {
        return this.#conditionsAppliedForTestPromise;
    }
    conditionsForId(appliedNetworkConditionsId) {
        const requestConditions = this.#requestConditionsById.get(appliedNetworkConditionsId);
        if (!requestConditions) {
            return undefined;
        }
        const { conditions, urlPattern } = requestConditions;
        return new AppliedNetworkConditions(conditions, appliedNetworkConditionsId, urlPattern);
    }
}
_a = RequestConditions;
export class AppliedNetworkConditions {
    conditions;
    appliedNetworkConditionsId;
    urlPattern;
    constructor(conditions, appliedNetworkConditionsId, urlPattern) {
        this.conditions = conditions;
        this.appliedNetworkConditionsId = appliedNetworkConditionsId;
        this.urlPattern = urlPattern;
    }
}
export class MultitargetNetworkManager extends Common.ObjectWrapper.ObjectWrapper {
    #targetManager;
    #userAgentOverride = '';
    #userAgentMetadataOverride = null;
    #networkAgents = new Set();
    #fetchAgents = new Set();
    inflightMainResourceRequests = new Map();
    #networkConditions = NoThrottlingConditions;
    #updatingInterceptionPatternsPromise = null;
    #requestConditions;
    #urlsForRequestInterceptor = new Platform.MapUtilities.Multimap();
    #extraHeaders;
    #customUserAgent;
    #isBlocking = false;
    constructor(targetManager) {
        super();
        this.#targetManager = targetManager;
        const settings = targetManager.settings;
        this.#requestConditions = new RequestConditions(settings);
        // TODO(allada) Remove these and merge it with request interception.
        const blockedPatternChanged = () => {
            this.updateBlockedPatterns();
            this.dispatchEventToListeners("BlockedPatternsChanged" /* MultitargetNetworkManager.Events.BLOCKED_PATTERNS_CHANGED */);
        };
        this.#requestConditions.addEventListener("request-conditions-changed" /* RequestConditions.Events.REQUEST_CONDITIONS_CHANGED */, blockedPatternChanged);
        this.updateBlockedPatterns();
        this.#targetManager.observeModels(NetworkManager, this);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew, targetManager } = opts;
        if (!Root.DevToolsContext.globalInstance().has(MultitargetNetworkManager) || forceNew) {
            /* eslint-disable @devtools/no-instance-of-migrated-singletons */
            Root.DevToolsContext.globalInstance().set(MultitargetNetworkManager, new MultitargetNetworkManager(targetManager ?? TargetManager.instance()));
            /* eslint-enable @devtools/no-instance-of-migrated-singletons */
        }
        return Root.DevToolsContext.globalInstance().get(MultitargetNetworkManager);
    }
    static dispose() {
        Root.DevToolsContext.globalInstance().delete(MultitargetNetworkManager);
    }
    static patchUserAgentWithChromeVersion(uaString) {
        // Patches Chrome/ChrOS version from user #agent ("1.2.3.4" when user #agent is: "Chrome/1.2.3.4").
        // Otherwise, ignore it. This assumes additional appVersions appear after the Chrome version.
        const chromeVersion = Root.Runtime.getChromeVersion();
        if (chromeVersion.length > 0) {
            // "1.2.3.4" becomes "1.0.100.0"
            const additionalAppVersion = chromeVersion.split('.', 1)[0] + '.0.100.0';
            return Platform.StringUtilities.sprintf(uaString, chromeVersion, additionalAppVersion);
        }
        return uaString;
    }
    static patchUserAgentMetadataWithChromeVersion(userAgentMetadata) {
        // Patches Chrome/ChrOS version from user #agent metadata ("1.2.3.4" when user #agent is: "Chrome/1.2.3.4").
        // Otherwise, ignore it. This assumes additional appVersions appear after the Chrome version.
        if (!userAgentMetadata.brands) {
            return;
        }
        const chromeVersion = Root.Runtime.getChromeVersion();
        if (chromeVersion.length === 0) {
            return;
        }
        const majorVersion = chromeVersion.split('.', 1)[0];
        for (const brand of userAgentMetadata.brands) {
            if (brand.version.includes('%s')) {
                brand.version = Platform.StringUtilities.sprintf(brand.version, majorVersion);
            }
        }
        if (userAgentMetadata.fullVersion) {
            if (userAgentMetadata.fullVersion.includes('%s')) {
                userAgentMetadata.fullVersion = Platform.StringUtilities.sprintf(userAgentMetadata.fullVersion, chromeVersion);
            }
        }
    }
    modelAdded(networkManager) {
        const networkAgent = networkManager.target().networkAgent();
        const fetchAgent = networkManager.target().fetchAgent();
        if (this.#extraHeaders) {
            void networkAgent.invoke_setExtraHTTPHeaders({ headers: this.#extraHeaders });
        }
        if (this.currentUserAgent()) {
            void networkAgent.invoke_setUserAgentOverride({ userAgent: this.currentUserAgent(), userAgentMetadata: this.#userAgentMetadataOverride || undefined });
        }
        this.#requestConditions.applyConditions(this.isOffline(), this.isThrottling() ? this.#networkConditions : null, networkAgent);
        if (this.isIntercepting()) {
            void fetchAgent.invoke_enable({ patterns: this.#urlsForRequestInterceptor.valuesArray() });
        }
        this.#networkAgents.add(networkAgent);
        this.#fetchAgents.add(fetchAgent);
    }
    modelRemoved(networkManager) {
        for (const entry of this.inflightMainResourceRequests) {
            const manager = NetworkManager.forRequest((entry[1]));
            if (manager !== networkManager) {
                continue;
            }
            this.inflightMainResourceRequests.delete((entry[0]));
        }
        this.#networkAgents.delete(networkManager.target().networkAgent());
        this.#fetchAgents.delete(networkManager.target().fetchAgent());
    }
    isThrottling() {
        return this.#networkConditions.download >= 0 || this.#networkConditions.upload >= 0 ||
            this.#networkConditions.latency > 0;
    }
    isOffline() {
        return !this.#networkConditions.download && !this.#networkConditions.upload;
    }
    setNetworkConditions(conditions) {
        this.#networkConditions = conditions;
        this.#requestConditions.applyConditions(this.isOffline(), this.isThrottling() ? this.#networkConditions : null, ...this.#networkAgents);
        this.dispatchEventToListeners("ConditionsChanged" /* MultitargetNetworkManager.Events.CONDITIONS_CHANGED */);
    }
    networkConditions() {
        return this.#networkConditions;
    }
    updateNetworkConditions(networkAgent) {
        const conditions = this.#networkConditions;
        if (!this.isThrottling()) {
            void networkAgent.invoke_emulateNetworkConditions({
                offline: false,
                latency: 0,
                downloadThroughput: 0,
                uploadThroughput: 0,
            });
        }
        else {
            void networkAgent.invoke_emulateNetworkConditions({
                offline: this.isOffline(),
                latency: conditions.latency,
                downloadThroughput: conditions.download < 0 ? 0 : conditions.download,
                uploadThroughput: conditions.upload < 0 ? 0 : conditions.upload,
                packetLoss: (conditions.packetLoss ?? 0) < 0 ? 0 : conditions.packetLoss,
                packetQueueLength: conditions.packetQueueLength,
                packetReordering: conditions.packetReordering,
                connectionType: NetworkManager.connectionType(conditions),
            });
        }
    }
    setExtraHTTPHeaders(headers) {
        this.#extraHeaders = headers;
        for (const agent of this.#networkAgents) {
            void agent.invoke_setExtraHTTPHeaders({ headers: this.#extraHeaders });
        }
    }
    currentUserAgent() {
        return this.#customUserAgent ? this.#customUserAgent : this.#userAgentOverride;
    }
    updateUserAgentOverride() {
        const userAgent = this.currentUserAgent();
        for (const agent of this.#networkAgents) {
            void agent.invoke_setUserAgentOverride({ userAgent, userAgentMetadata: this.#userAgentMetadataOverride || undefined });
        }
    }
    setUserAgentOverride(userAgent, userAgentMetadataOverride) {
        const uaChanged = (this.#userAgentOverride !== userAgent);
        this.#userAgentOverride = userAgent;
        if (!this.#customUserAgent) {
            this.#userAgentMetadataOverride = userAgentMetadataOverride;
            this.updateUserAgentOverride();
        }
        else {
            this.#userAgentMetadataOverride = null;
        }
        if (uaChanged) {
            this.dispatchEventToListeners("UserAgentChanged" /* MultitargetNetworkManager.Events.USER_AGENT_CHANGED */);
        }
    }
    setCustomUserAgentOverride(userAgent, userAgentMetadataOverride = null) {
        this.#customUserAgent = userAgent;
        this.#userAgentMetadataOverride = userAgentMetadataOverride;
        this.updateUserAgentOverride();
    }
    get requestConditions() {
        return this.#requestConditions;
    }
    isBlocking() {
        return this.#isBlocking && this.requestConditions.conditionsEnabled;
    }
    updateBlockedPatterns() {
        this.#isBlocking = this.#requestConditions.applyConditions(this.isOffline(), this.isThrottling() ? this.#networkConditions : null, ...this.#networkAgents);
    }
    isIntercepting() {
        return Boolean(this.#urlsForRequestInterceptor.size);
    }
    setInterceptionHandlerForPatterns(patterns, requestInterceptor) {
        // Note: requestInterceptors may receive interception #requests for patterns they did not subscribe to.
        this.#urlsForRequestInterceptor.deleteAll(requestInterceptor);
        for (const newPattern of patterns) {
            this.#urlsForRequestInterceptor.set(requestInterceptor, newPattern);
        }
        return this.updateInterceptionPatternsOnNextTick();
    }
    updateInterceptionPatternsOnNextTick() {
        // This is used so we can register and unregister patterns in loops without sending lots of protocol messages.
        if (!this.#updatingInterceptionPatternsPromise) {
            this.#updatingInterceptionPatternsPromise = Promise.resolve().then(this.updateInterceptionPatterns.bind(this));
        }
        return this.#updatingInterceptionPatternsPromise;
    }
    async updateInterceptionPatterns() {
        const settings = this.#targetManager.settings;
        if (!settings.resolve(cacheDisabledSettingDescriptor).get()) {
            settings.resolve(cacheDisabledSettingDescriptor).set(true);
        }
        this.#updatingInterceptionPatternsPromise = null;
        const promises = [];
        for (const agent of this.#fetchAgents) {
            promises.push(agent.invoke_enable({ patterns: this.#urlsForRequestInterceptor.valuesArray() }));
        }
        this.dispatchEventToListeners("InterceptorsChanged" /* MultitargetNetworkManager.Events.INTERCEPTORS_CHANGED */);
        await Promise.all(promises);
    }
    async requestIntercepted(interceptedRequest) {
        for (const requestInterceptor of this.#urlsForRequestInterceptor.keysArray()) {
            await requestInterceptor(interceptedRequest);
            if (interceptedRequest.hasResponded() && interceptedRequest.networkRequest) {
                this.dispatchEventToListeners("RequestIntercepted" /* MultitargetNetworkManager.Events.REQUEST_INTERCEPTED */, interceptedRequest.networkRequest.requestId());
                return;
            }
        }
        if (!interceptedRequest.hasResponded()) {
            interceptedRequest.continueRequestWithoutChange();
        }
    }
    clearBrowserCache() {
        for (const agent of this.#networkAgents) {
            void agent.invoke_clearBrowserCache();
        }
    }
    clearBrowserCookies() {
        for (const agent of this.#networkAgents) {
            void agent.invoke_clearBrowserCookies();
        }
    }
    async getCertificate(origin) {
        const target = this.#targetManager.primaryPageTarget();
        if (!target) {
            return [];
        }
        const certificate = await target.networkAgent().invoke_getCertificate({ origin });
        if (!certificate) {
            return [];
        }
        return certificate.tableNames;
    }
    appliedRequestConditions(requestInternal) {
        if (!requestInternal.appliedNetworkConditionsId) {
            return undefined;
        }
        return this.requestConditions.conditionsForId(requestInternal.appliedNetworkConditionsId);
    }
}
export class InterceptedRequest {
    #multitargetNetworkManager;
    #fetchAgent;
    #hasResponded = false;
    request;
    resourceType;
    responseStatusCode;
    responseHeaders;
    requestId;
    networkRequest;
    constructor(multitargetNetworkManager, fetchAgent, request, resourceType, requestId, networkRequest, responseStatusCode, responseHeaders) {
        this.#multitargetNetworkManager = multitargetNetworkManager;
        this.#fetchAgent = fetchAgent;
        this.request = request;
        this.resourceType = resourceType;
        this.responseStatusCode = responseStatusCode;
        this.responseHeaders = responseHeaders;
        this.requestId = requestId;
        this.networkRequest = networkRequest;
    }
    hasResponded() {
        return this.#hasResponded;
    }
    static mergeSetCookieHeaders(originalSetCookieHeaders, setCookieHeadersFromOverrides) {
        // Generates a map containing the `set-cookie` headers. Valid `set-cookie`
        // headers are stored by the cookie name. Malformed `set-cookie` headers are
        // stored by the whole header value. Duplicates are allowed.
        const generateHeaderMap = (headers) => {
            const result = new Map();
            for (const header of headers) {
                // The regex matches cookie headers of the form '<header-name>=<header-value>'.
                // <header-name> is a token as defined in https://www.rfc-editor.org/rfc/rfc9110.html#name-tokens.
                // The shape of <header-value> is not being validated at all here.
                const match = header.value.match(/^([a-zA-Z0-9!#$%&'*+.^_`|~-]+=)(.*)$/);
                if (match) {
                    if (result.has(match[1])) {
                        result.get(match[1])?.push(header.value);
                    }
                    else {
                        result.set(match[1], [header.value]);
                    }
                }
                else if (result.has(header.value)) {
                    result.get(header.value)?.push(header.value);
                }
                else {
                    result.set(header.value, [header.value]);
                }
            }
            return result;
        };
        const originalHeadersMap = generateHeaderMap(originalSetCookieHeaders);
        const overridesHeaderMap = generateHeaderMap(setCookieHeadersFromOverrides);
        // Iterate over original headers. If the same key is found among the
        // overrides, use those instead.
        const mergedHeaders = [];
        for (const [key, headerValues] of originalHeadersMap) {
            if (overridesHeaderMap.has(key)) {
                for (const headerValue of overridesHeaderMap.get(key) || []) {
                    mergedHeaders.push({ name: 'set-cookie', value: headerValue });
                }
            }
            else {
                for (const headerValue of headerValues) {
                    mergedHeaders.push({ name: 'set-cookie', value: headerValue });
                }
            }
        }
        // Finally add all overrides which have not been added yet.
        for (const [key, headerValues] of overridesHeaderMap) {
            if (originalHeadersMap.has(key)) {
                continue;
            }
            for (const headerValue of headerValues) {
                mergedHeaders.push({ name: 'set-cookie', value: headerValue });
            }
        }
        return mergedHeaders;
    }
    async continueRequestWithContent(contentBlob, encoded, responseHeaders, isBodyOverridden) {
        this.#hasResponded = true;
        const body = encoded ? await contentBlob.text() : await Common.Base64.encode(contentBlob).catch(err => {
            console.error(err);
            return '';
        });
        const responseCode = isBodyOverridden ? 200 : (this.responseStatusCode || 200);
        if (this.networkRequest) {
            const originalSetCookieHeaders = this.networkRequest?.originalResponseHeaders.filter(header => header.name === 'set-cookie') || [];
            const setCookieHeadersFromOverrides = responseHeaders.filter(header => header.name === 'set-cookie');
            this.networkRequest.setCookieHeaders =
                InterceptedRequest.mergeSetCookieHeaders(originalSetCookieHeaders, setCookieHeadersFromOverrides);
            this.networkRequest.hasOverriddenContent = isBodyOverridden;
            if (isBodyOverridden) {
                this.networkRequest.setContentDataProvider(async () => {
                    const { mimeType, charset } = this.getMimeTypeAndCharset();
                    return new TextUtils.ContentData.ContentData(body, /* isBase64= */ true, mimeType ?? 'application/octet-stream', charset ?? undefined);
                });
            }
        }
        void this.#fetchAgent.invoke_fulfillRequest({ requestId: this.requestId, responseCode, body, responseHeaders });
        this.#multitargetNetworkManager.dispatchEventToListeners("RequestFulfilled" /* MultitargetNetworkManager.Events.REQUEST_FULFILLED */, this.request.url);
    }
    continueRequestWithoutChange() {
        console.assert(!this.#hasResponded);
        this.#hasResponded = true;
        void this.#fetchAgent.invoke_continueRequest({ requestId: this.requestId });
    }
    async responseBody() {
        const response = await this.#fetchAgent.invoke_getResponseBody({ requestId: this.requestId });
        const error = response.getError();
        if (error) {
            return { error };
        }
        const { mimeType, charset } = this.getMimeTypeAndCharset();
        return new TextUtils.ContentData.ContentData(response.body, response.base64Encoded, mimeType ?? 'application/octet-stream', charset ?? undefined);
    }
    isRedirect() {
        return this.responseStatusCode !== undefined && this.responseStatusCode >= 300 && this.responseStatusCode < 400;
    }
    /**
     * Tries to determine the MIME type and charset for this intercepted request.
     * Looks at the intercepted response headers first (for Content-Type header), then
     * checks the `NetworkRequest` if we have one.
     */
    getMimeTypeAndCharset() {
        for (const header of this.responseHeaders ?? []) {
            if (header.name.toLowerCase() === 'content-type') {
                return Platform.MimeType.parseContentType(header.value);
            }
        }
        const mimeType = this.networkRequest?.mimeType ?? null;
        const charset = this.networkRequest?.charset() ?? null;
        return { mimeType, charset };
    }
}
/**
 * Helper class to match #requests created from requestWillBeSent with
 * requestWillBeSentExtraInfo and responseReceivedExtraInfo when they have the
 * same requestId due to redirects.
 */
class ExtraInfoBuilder {
    #requests = [];
    #responseExtraInfoFlag = [];
    #requestExtraInfos = [];
    #responseExtraInfos = [];
    #responseEarlyHintsHeaders = [];
    #finished = false;
    addRequest(req) {
        this.#requests.push(req);
        this.sync(this.#requests.length - 1);
    }
    addHasExtraInfo(hasExtraInfo) {
        this.#responseExtraInfoFlag.push(hasExtraInfo);
        // This comes in response, so it can't come before request or after next
        // request in the redirect chain.
        console.assert(this.#requests.length === this.#responseExtraInfoFlag.length, 'request/response count mismatch');
        if (!hasExtraInfo) {
            // We may potentially have gotten extra infos from the next redirect
            // request already. Account for that by inserting null for missing
            // extra infos at current position.
            this.#requestExtraInfos.splice(this.#requests.length - 1, 0, null);
            this.#responseExtraInfos.splice(this.#requests.length - 1, 0, null);
        }
        this.sync(this.#requests.length - 1);
    }
    addRequestExtraInfo(info) {
        this.#requestExtraInfos.push(info);
        this.sync(this.#requestExtraInfos.length - 1);
    }
    addResponseExtraInfo(info) {
        this.#responseExtraInfos.push(info);
        this.sync(this.#responseExtraInfos.length - 1);
    }
    setEarlyHintsHeaders(earlyHintsHeaders) {
        this.#responseEarlyHintsHeaders = earlyHintsHeaders;
        this.updateFinalRequest();
    }
    finished() {
        this.#finished = true;
        // We may have missed responseReceived event in case of failure.
        // That said, the ExtraInfo events still may be here, so mark them
        // as present. Event if they are not, this is harmless.
        // TODO(caseq): consider if we need to report hasExtraInfo in the
        // loadingFailed event.
        if (this.#responseExtraInfoFlag.length < this.#requests.length) {
            this.#responseExtraInfoFlag.push(true);
            this.sync(this.#responseExtraInfoFlag.length - 1);
        }
        console.assert(this.#requests.length === this.#responseExtraInfoFlag.length, 'request/response count mismatch when request finished');
        this.updateFinalRequest();
    }
    isFinished() {
        return this.#finished;
    }
    sync(index) {
        const req = this.#requests[index];
        if (!req) {
            return;
        }
        // No response yet, so we don't know if extra info would
        // be there, bail out for now.
        if (index >= this.#responseExtraInfoFlag.length) {
            return;
        }
        if (!this.#responseExtraInfoFlag[index]) {
            return;
        }
        const requestExtraInfo = this.#requestExtraInfos[index];
        if (requestExtraInfo) {
            req.addExtraRequestInfo(requestExtraInfo);
            this.#requestExtraInfos[index] = null;
        }
        const responseExtraInfo = this.#responseExtraInfos[index];
        if (responseExtraInfo) {
            req.addExtraResponseInfo(responseExtraInfo);
            this.#responseExtraInfos[index] = null;
        }
    }
    finalRequest() {
        if (!this.#finished) {
            return null;
        }
        return this.#requests[this.#requests.length - 1] || null;
    }
    updateFinalRequest() {
        if (!this.#finished) {
            return;
        }
        const finalRequest = this.finalRequest();
        finalRequest?.setEarlyHintsHeaders(this.#responseEarlyHintsHeaders);
    }
}
SDKModel.register(NetworkManager, { capabilities: 16 /* Capability.NETWORK */, autostart: true });
export function networkConditionsEqual(first, second) {
    if ('block' in first || 'block' in second) {
        if ('block' in first && 'block' in second) {
            const firstTitle = (typeof first.title === 'function' ? first.title() : first.title);
            const secondTitle = (typeof second.title === 'function' ? second.title() : second.title);
            return firstTitle === secondTitle && first.block === second.block;
        }
        return false;
    }
    // Caution: titles might be different function instances, which produce
    // the same value.
    // We prefer to use the i18nTitleKey to prevent against locale changes or
    // UIString changes that might change the value vs what the user has stored
    // locally.
    const firstTitle = first.i18nTitleKey || (typeof first.title === 'function' ? first.title() : first.title);
    const secondTitle = second.i18nTitleKey || (typeof second.title === 'function' ? second.title() : second.title);
    return second.download === first.download && second.upload === first.upload && second.latency === first.latency &&
        first.packetLoss === second.packetLoss && first.packetQueueLength === second.packetQueueLength &&
        first.packetReordering === second.packetReordering && secondTitle === firstTitle;
}
export const THROTTLING_CONDITIONS_LOOKUP = new Map([
    ["NO_THROTTLING" /* PredefinedThrottlingConditionKey.NO_THROTTLING */, NoThrottlingConditions],
    ["OFFLINE" /* PredefinedThrottlingConditionKey.OFFLINE */, OfflineConditions],
    ["SPEED_3G" /* PredefinedThrottlingConditionKey.SPEED_3G */, Slow3GConditions],
    ["SPEED_SLOW_4G" /* PredefinedThrottlingConditionKey.SPEED_SLOW_4G */, Slow4GConditions],
    ["SPEED_FAST_4G" /* PredefinedThrottlingConditionKey.SPEED_FAST_4G */, Fast4GConditions],
]);
function keyIsPredefined(key) {
    return !key.startsWith('USER_CUSTOM_SETTING_');
}
export function keyIsCustomUser(key) {
    return key.startsWith('USER_CUSTOM_SETTING_');
}
export function getPredefinedCondition(key) {
    if (!keyIsPredefined(key)) {
        return null;
    }
    return THROTTLING_CONDITIONS_LOOKUP.get(key) ?? null;
}
export function getPredefinedOrBlockingCondition(key) {
    return key === "BLOCKING" /* PredefinedThrottlingConditionKey.BLOCKING */ ? BlockingConditions : getPredefinedCondition(key);
}
/**
 * For the given Round Trip Time (in MilliSeconds), return the best throttling conditions.
 */
export function getRecommendedNetworkPreset(rtt) {
    const RTT_COMPARISON_THRESHOLD = 200;
    const RTT_MINIMUM = 60;
    if (!Number.isFinite(rtt)) {
        return null;
    }
    if (rtt < RTT_MINIMUM) {
        return null;
    }
    // We pick from the set of presets in the panel but do not want to allow
    // the "No Throttling" option to be picked.
    const presets = THROTTLING_CONDITIONS_LOOKUP.values()
        .filter(condition => {
        return condition !== NoThrottlingConditions;
    })
        .toArray();
    let closestPreset = null;
    let smallestDiff = Infinity;
    for (const preset of presets) {
        const { targetLatency } = preset;
        if (!targetLatency) {
            continue;
        }
        const diff = Math.abs(targetLatency - rtt);
        if (diff > RTT_COMPARISON_THRESHOLD) {
            continue;
        }
        if (smallestDiff < diff) {
            continue;
        }
        closestPreset = preset;
        smallestDiff = diff;
    }
    return closestPreset;
}
//# sourceMappingURL=NetworkManager.js.map