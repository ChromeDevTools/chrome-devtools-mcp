import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { NetworkRequest } from './NetworkRequest.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
import { type SDKModelObserver, TargetManager } from './TargetManager.js';
/**
 * We store two settings to disk to persist network throttling.
 * 1. The custom conditions that the user has defined.
 * 2. The active `key` that applies the correct current preset.
 * The reason the setting creation functions are defined here is because they are referred
 * to in multiple places, and this ensures we don't have accidental typos which
 * mean extra settings get mistakenly created.
 */
export declare function customUserNetworkConditionsSetting(settings: Common.Settings.Settings): Common.Settings.Setting<Conditions[]>;
export declare function activeNetworkThrottlingKeySetting(settings: Common.Settings.Settings): Common.Settings.Setting<ThrottlingConditionKey>;
export declare class NetworkManager extends SDKModel<EventTypes> {
    #private;
    readonly dispatcher: NetworkDispatcher;
    readonly fetchDispatcher: FetchDispatcher;
    readonly activeNetworkThrottlingKey: Common.Settings.Setting<ThrottlingConditionKey>;
    constructor(target: Target);
    static forRequest(request: NetworkRequest): NetworkManager | null;
    static canResendRequest(request: NetworkRequest, fullFidelity: boolean): boolean;
    static replayRequest(request: NetworkRequest): void;
    static resendRequest(request: NetworkRequest): Promise<void>;
    static searchInRequest(request: NetworkRequest, query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
    static requestContentData(request: NetworkRequest): Promise<TextUtils.ContentData.ContentDataOrError>;
    /**
     * Returns the already received bytes for an in-flight request. After calling this method
     * "dataReceived" events will contain additional data.
     */
    static streamResponseBody(request: NetworkRequest): Promise<TextUtils.ContentData.ContentDataOrError>;
    static requestPostData(request: NetworkRequest): Promise<string | null>;
    /**
     * Returns the request post data as a ContentData suitable for binary
     * viewers (hex, base64, utf-8) in the Payload tab.  When the backend
     * provides base64-encoded (possibly compressed) data, the body is
     * decompressed first so viewers show the actual payload bytes rather
     * than gzip/deflate framing.
     */
    static requestPostDataContentData(request: NetworkRequest): Promise<TextUtils.ContentData.ContentDataOrError>;
    static connectionType(conditions: Conditions): Protocol.Network.ConnectionType;
    static lowercaseHeaders(headers: Protocol.Network.Headers): Protocol.Network.Headers;
    requestForURL(url: Platform.DevToolsPath.UrlString): NetworkRequest | null;
    requestForId(id: string): NetworkRequest | null;
    requestForLoaderId(loaderId: Protocol.Network.LoaderId): NetworkRequest | null;
    private cacheDisabledSettingChanged;
    private preserveLogChanged;
    dispose(): void;
    private bypassServiceWorkerChanged;
    getSecurityIsolationStatus(frameId: Protocol.Page.FrameId | null): Promise<Protocol.Network.SecurityIsolationStatus | null>;
    enableReportingApi(enable?: boolean): Promise<Protocol.ProtocolResponseWithError>;
    enableDeviceBoundSessions(enable?: boolean): Promise<Protocol.ProtocolResponseWithError>;
    deleteDeviceBoundSession(key: Protocol.Network.DeviceBoundSessionKey): Promise<Protocol.ProtocolResponseWithError>;
    loadNetworkResource(frameId: Protocol.Page.FrameId | null, url: Platform.DevToolsPath.UrlString, options: Protocol.Network.LoadNetworkResourceOptions): Promise<Protocol.Network.LoadNetworkResourcePageResult>;
    clearRequests(): void;
}
export declare enum Events {
    RequestStarted = "RequestStarted",
    RequestUpdated = "RequestUpdated",
    RequestFinished = "RequestFinished",
    RequestUpdateDropped = "RequestUpdateDropped",
    ResponseReceived = "ResponseReceived",
    MessageGenerated = "MessageGenerated",
    RequestRedirected = "RequestRedirected",
    LoadingFinished = "LoadingFinished",
    ReportingApiReportAdded = "ReportingApiReportAdded",
    ReportingApiReportUpdated = "ReportingApiReportUpdated",
    ReportingApiEndpointsChangedForOrigin = "ReportingApiEndpointsChangedForOrigin",
    DeviceBoundSessionsAdded = "DeviceBoundSessionsAdded",
    DeviceBoundSessionEventOccurred = "DeviceBoundSessionEventOccurred"
}
export interface RequestStartedEvent {
    request: NetworkRequest;
    originalRequest: Protocol.Network.Request | null;
}
export interface ResponseReceivedEvent {
    request: NetworkRequest;
    response: Protocol.Network.Response;
}
export interface MessageGeneratedEvent {
    message: Common.UIString.LocalizedString;
    requestId: string;
    warning: boolean;
}
export interface EventTypes {
    [Events.RequestStarted]: RequestStartedEvent;
    [Events.RequestUpdated]: NetworkRequest;
    [Events.RequestFinished]: NetworkRequest;
    [Events.RequestUpdateDropped]: RequestUpdateDroppedEventData;
    [Events.ResponseReceived]: ResponseReceivedEvent;
    [Events.MessageGenerated]: MessageGeneratedEvent;
    [Events.RequestRedirected]: NetworkRequest;
    [Events.LoadingFinished]: NetworkRequest;
    [Events.ReportingApiReportAdded]: Protocol.Network.ReportingApiReport;
    [Events.ReportingApiReportUpdated]: Protocol.Network.ReportingApiReport;
    [Events.ReportingApiEndpointsChangedForOrigin]: Protocol.Network.ReportingApiEndpointsChangedForOriginEvent;
    [Events.DeviceBoundSessionsAdded]: Protocol.Network.DeviceBoundSession[];
    [Events.DeviceBoundSessionEventOccurred]: Protocol.Network.DeviceBoundSessionEventOccurredEvent;
}
/**
 * Define some built-in DevTools throttling presets.
 * Note that for the download, upload and RTT values we multiply them by adjustment factors to make DevTools' emulation more accurate.
 * @see https://docs.google.com/document/d/10lfVdS1iDWCRKQXPfbxEn4Or99D64mvNlugP1AQuFlE/edit for historical context.
 * @see https://crbug.com/342406608#comment10 for context around the addition of 4G presets in June 2024.
 */
export declare const BlockingConditions: ThrottlingConditions;
export declare const NoThrottlingConditions: Conditions;
export declare const OfflineConditions: Conditions;
export declare const Slow3GConditions: Conditions;
export declare const Slow4GConditions: Conditions;
export declare const Fast4GConditions: Conditions;
export declare class FetchDispatcher implements ProtocolProxyApi.FetchDispatcher {
    #private;
    constructor(agent: ProtocolProxyApi.FetchApi, manager: NetworkManager);
    requestPaused({ requestId, request, resourceType, responseStatusCode, responseHeaders, networkId }: Protocol.Fetch.RequestPausedEvent): void;
    authRequired({}: Protocol.Fetch.AuthRequiredEvent): void;
}
export declare class NetworkDispatcher implements ProtocolProxyApi.NetworkDispatcher {
    #private;
    constructor(manager: NetworkManager);
    private headersMapToHeadersArray;
    private updateNetworkRequestWithRequest;
    private updateNetworkRequestWithResponse;
    requestForId(id: string): NetworkRequest | null;
    requestForURL(url: Platform.DevToolsPath.UrlString): NetworkRequest | null;
    requestForLoaderId(loaderId: Protocol.Network.LoaderId): NetworkRequest | null;
    resourceChangedPriority({ requestId, newPriority }: Protocol.Network.ResourceChangedPriorityEvent): void;
    signedExchangeReceived({ requestId, info }: Protocol.Network.SignedExchangeReceivedEvent): void;
    requestWillBeSent({ requestId, loaderId, documentURL, request, timestamp, wallTime, initiator, redirectHasExtraInfo, redirectResponse, type, frameId, hasUserGesture, renderBlockingBehavior, }: Protocol.Network.RequestWillBeSentEvent): void;
    requestServedFromCache({ requestId }: Protocol.Network.RequestServedFromCacheEvent): void;
    responseReceived({ requestId, loaderId, timestamp, type, response, hasExtraInfo, frameId }: Protocol.Network.ResponseReceivedEvent): void;
    dataReceived(event: Protocol.Network.DataReceivedEvent): void;
    loadingFinished({ requestId, timestamp: finishTime, encodedDataLength }: Protocol.Network.LoadingFinishedEvent): void;
    loadingFailed({ requestId, timestamp: time, type: resourceType, errorText: localizedDescription, canceled, blockedReason, corsErrorStatus, }: Protocol.Network.LoadingFailedEvent): void;
    webSocketCreated({ requestId, url: requestURL, initiator }: Protocol.Network.WebSocketCreatedEvent): void;
    webSocketWillSendHandshakeRequest({ requestId, timestamp: time, wallTime, request }: Protocol.Network.WebSocketWillSendHandshakeRequestEvent): void;
    webSocketHandshakeResponseReceived({ requestId, timestamp: time, response }: Protocol.Network.WebSocketHandshakeResponseReceivedEvent): void;
    webSocketFrameReceived({ requestId, timestamp: time, response }: Protocol.Network.WebSocketFrameReceivedEvent): void;
    webSocketFrameSent({ requestId, timestamp: time, response }: Protocol.Network.WebSocketFrameSentEvent): void;
    webSocketFrameError({ requestId, timestamp: time, errorMessage }: Protocol.Network.WebSocketFrameErrorEvent): void;
    webSocketClosed({ requestId, timestamp: time }: Protocol.Network.WebSocketClosedEvent): void;
    eventSourceMessageReceived({ requestId, timestamp: time, eventName, eventId, data }: Protocol.Network.EventSourceMessageReceivedEvent): void;
    requestWillBeSentExtraInfo({ requestId, associatedCookies, headers, deviceBoundSessionUsages, clientSecurityState, connectTiming, siteHasCookieInOtherPartition, appliedNetworkConditionsId, }: Protocol.Network.RequestWillBeSentExtraInfoEvent): void;
    responseReceivedEarlyHints({ requestId, headers, }: Protocol.Network.ResponseReceivedEarlyHintsEvent): void;
    responseReceivedExtraInfo({ requestId, blockedCookies, headers, headersText, resourceIPAddressSpace, statusCode, cookiePartitionKey, cookiePartitionKeyOpaque, exemptedCookies, }: Protocol.Network.ResponseReceivedExtraInfoEvent): void;
    private getExtraInfoBuilder;
    private appendRedirect;
    private maybeAdoptMainResourceRequest;
    private startNetworkRequest;
    private updateNetworkRequest;
    private finishNetworkRequest;
    clearRequests(): void;
    webTransportCreated({ transportId, url: requestURL, timestamp: time, initiator }: Protocol.Network.WebTransportCreatedEvent): void;
    webTransportConnectionEstablished({ transportId, timestamp: time }: Protocol.Network.WebTransportConnectionEstablishedEvent): void;
    webTransportClosed({ transportId, timestamp: time }: Protocol.Network.WebTransportClosedEvent): void;
    directTCPSocketCreated(event: Protocol.Network.DirectTCPSocketCreatedEvent): void;
    directTCPSocketOpened(event: Protocol.Network.DirectTCPSocketOpenedEvent): void;
    directTCPSocketAborted(event: Protocol.Network.DirectTCPSocketAbortedEvent): void;
    directTCPSocketClosed(event: Protocol.Network.DirectTCPSocketClosedEvent): void;
    directTCPSocketChunkSent(event: Protocol.Network.DirectTCPSocketChunkSentEvent): void;
    directTCPSocketChunkReceived(event: Protocol.Network.DirectTCPSocketChunkReceivedEvent): void;
    directUDPSocketCreated(event: Protocol.Network.DirectUDPSocketCreatedEvent): void;
    directUDPSocketOpened(event: Protocol.Network.DirectUDPSocketOpenedEvent): void;
    directUDPSocketAborted(event: Protocol.Network.DirectUDPSocketAbortedEvent): void;
    directUDPSocketClosed(event: Protocol.Network.DirectUDPSocketClosedEvent): void;
    directUDPSocketChunkSent(event: Protocol.Network.DirectUDPSocketChunkSentEvent): void;
    directUDPSocketChunkReceived(event: Protocol.Network.DirectUDPSocketChunkReceivedEvent): void;
    directUDPSocketJoinedMulticastGroup(event: Protocol.Network.DirectUDPSocketJoinedMulticastGroupEvent): void;
    directUDPSocketLeftMulticastGroup(event: Protocol.Network.DirectUDPSocketLeftMulticastGroupEvent): void;
    trustTokenOperationDone(event: Protocol.Network.TrustTokenOperationDoneEvent): void;
    reportingApiReportAdded(data: Protocol.Network.ReportingApiReportAddedEvent): void;
    reportingApiReportUpdated(data: Protocol.Network.ReportingApiReportUpdatedEvent): void;
    reportingApiEndpointsChangedForOrigin(data: Protocol.Network.ReportingApiEndpointsChangedForOriginEvent): void;
    deviceBoundSessionsAdded(_params: Protocol.Network.DeviceBoundSessionsAddedEvent): void;
    deviceBoundSessionEventOccurred(_params: Protocol.Network.DeviceBoundSessionEventOccurredEvent): void;
    policyUpdated(): void;
    /**
     * @deprecated
     * This method is only kept for usage in a web test.
     */
    protected createNetworkRequest(requestId: Protocol.Network.RequestId, frameId: Protocol.Page.FrameId, loaderId: Protocol.Network.LoaderId, url: string, documentURL: string, initiator: Protocol.Network.Initiator | null): NetworkRequest;
    private concatHostPort;
}
export type RequestConditionsSetting = {
    url: string;
    enabled: boolean;
} | {
    urlPattern: URLPatternConstructorString;
    conditions: ThrottlingConditionKey;
    enabled: boolean;
};
export type URLPatternConstructorString = Platform.Brand.Brand<string, 'URLPatternConstructorString'>;
export declare const enum RequestURLPatternValidity {
    VALID = "valid",
    FAILED_TO_PARSE = "failed-to-parse",
    HAS_REGEXP_GROUPS = "has-regexp-groups"
}
export declare class RequestURLPattern {
    readonly constructorString: URLPatternConstructorString;
    readonly pattern: URLPattern;
    private constructor();
    static isValidPattern(pattern: string): RequestURLPatternValidity;
    static create(constructorString: URLPatternConstructorString): RequestURLPattern | null;
    static upgradeFromWildcard(pattern: string): RequestURLPattern | null;
}
export declare class RequestCondition extends Common.ObjectWrapper.ObjectWrapper<RequestCondition.EventTypes> {
    #private;
    static createFromSetting(setting: RequestConditionsSetting, settings: Common.Settings.Settings): RequestCondition;
    static create(pattern: RequestURLPattern, conditions: ThrottlingConditions): RequestCondition;
    private constructor();
    get isBlocking(): boolean;
    get ruleIds(): Set<string>;
    get constructorString(): string | undefined;
    get wildcardURL(): string | undefined;
    get constructorStringOrWildcardURL(): string;
    set pattern(pattern: RequestURLPattern);
    get enabled(): boolean;
    set enabled(enabled: boolean);
    get conditions(): ThrottlingConditions;
    set conditions(conditions: ThrottlingConditions);
    toSetting(): RequestConditionsSetting;
    get originalOrUpgradedURLPattern(): URLPattern | undefined;
}
export declare namespace RequestCondition {
    const enum Events {
        REQUEST_CONDITION_CHANGED = "request-condition-changed"
    }
    interface EventTypes {
        [Events.REQUEST_CONDITION_CHANGED]: void;
    }
}
export declare class RequestConditions extends Common.ObjectWrapper.ObjectWrapper<RequestConditions.EventTypes> {
    #private;
    constructor(settings: Common.Settings.Settings);
    get count(): number;
    get conditionsEnabled(): boolean;
    set conditionsEnabled(enabled: boolean);
    findCondition(pattern: string): RequestCondition | undefined;
    has(url: string): boolean;
    add(...conditions: RequestCondition[]): void;
    decreasePriority(condition: RequestCondition): void;
    increasePriority(condition: RequestCondition): void;
    delete(condition: RequestCondition): void;
    clear(): void;
    get conditions(): IteratorObject<RequestCondition>;
    applyConditions(offline: boolean, globalConditions: Conditions | null, ...agents: ProtocolProxyApi.NetworkApi[]): boolean;
    conditionsAppliedForTest(): Promise<unknown>;
    conditionsForId(appliedNetworkConditionsId: string): AppliedNetworkConditions | undefined;
}
export declare namespace RequestConditions {
    const enum Events {
        REQUEST_CONDITIONS_CHANGED = "request-conditions-changed"
    }
    interface EventTypes {
        [Events.REQUEST_CONDITIONS_CHANGED]: void;
    }
}
export declare class AppliedNetworkConditions {
    readonly conditions: Conditions;
    readonly appliedNetworkConditionsId: string;
    readonly urlPattern?: string | undefined;
    constructor(conditions: Conditions, appliedNetworkConditionsId: string, urlPattern?: string | undefined);
}
export declare class MultitargetNetworkManager extends Common.ObjectWrapper.ObjectWrapper<MultitargetNetworkManager.EventTypes> implements SDKModelObserver<NetworkManager> {
    #private;
    readonly inflightMainResourceRequests: Map<string, NetworkRequest>;
    constructor(targetManager: TargetManager);
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager?: TargetManager;
    }): MultitargetNetworkManager;
    static dispose(): void;
    static patchUserAgentWithChromeVersion(uaString: string): string;
    static patchUserAgentMetadataWithChromeVersion(userAgentMetadata: Protocol.Emulation.UserAgentMetadata): void;
    modelAdded(networkManager: NetworkManager): void;
    modelRemoved(networkManager: NetworkManager): void;
    isThrottling(): boolean;
    isOffline(): boolean;
    setNetworkConditions(conditions: Conditions): void;
    networkConditions(): Conditions;
    private updateNetworkConditions;
    setExtraHTTPHeaders(headers: Protocol.Network.Headers): void;
    currentUserAgent(): string;
    private updateUserAgentOverride;
    setUserAgentOverride(userAgent: string, userAgentMetadataOverride: Protocol.Emulation.UserAgentMetadata | null): void;
    setCustomUserAgentOverride(userAgent: string, userAgentMetadataOverride?: Protocol.Emulation.UserAgentMetadata | null): void;
    get requestConditions(): RequestConditions;
    isBlocking(): boolean;
    private updateBlockedPatterns;
    isIntercepting(): boolean;
    setInterceptionHandlerForPatterns(patterns: InterceptionPattern[], requestInterceptor: (arg0: InterceptedRequest) => Promise<void>): Promise<void>;
    private updateInterceptionPatternsOnNextTick;
    private updateInterceptionPatterns;
    requestIntercepted(interceptedRequest: InterceptedRequest): Promise<void>;
    clearBrowserCache(): void;
    clearBrowserCookies(): void;
    getCertificate(origin: string): Promise<string[]>;
    appliedRequestConditions(requestInternal: NetworkRequest): AppliedNetworkConditions | undefined;
}
export declare namespace MultitargetNetworkManager {
    const enum Events {
        BLOCKED_PATTERNS_CHANGED = "BlockedPatternsChanged",
        CONDITIONS_CHANGED = "ConditionsChanged",
        USER_AGENT_CHANGED = "UserAgentChanged",
        INTERCEPTORS_CHANGED = "InterceptorsChanged",
        REQUEST_INTERCEPTED = "RequestIntercepted",
        REQUEST_FULFILLED = "RequestFulfilled"
    }
    interface EventTypes {
        [Events.BLOCKED_PATTERNS_CHANGED]: void;
        [Events.CONDITIONS_CHANGED]: void;
        [Events.USER_AGENT_CHANGED]: void;
        [Events.INTERCEPTORS_CHANGED]: void;
        [Events.REQUEST_INTERCEPTED]: string;
        [Events.REQUEST_FULFILLED]: Platform.DevToolsPath.UrlString;
    }
}
export declare class InterceptedRequest {
    #private;
    request: Protocol.Network.Request;
    resourceType: Protocol.Network.ResourceType;
    responseStatusCode: number | undefined;
    responseHeaders: Protocol.Fetch.HeaderEntry[] | undefined;
    requestId: Protocol.Fetch.RequestId;
    networkRequest: NetworkRequest | null;
    constructor(multitargetNetworkManager: MultitargetNetworkManager, fetchAgent: ProtocolProxyApi.FetchApi, request: Protocol.Network.Request, resourceType: Protocol.Network.ResourceType, requestId: Protocol.Fetch.RequestId, networkRequest: NetworkRequest | null, responseStatusCode?: number, responseHeaders?: Protocol.Fetch.HeaderEntry[]);
    hasResponded(): boolean;
    static mergeSetCookieHeaders(originalSetCookieHeaders: Protocol.Fetch.HeaderEntry[], setCookieHeadersFromOverrides: Protocol.Fetch.HeaderEntry[]): Protocol.Fetch.HeaderEntry[];
    continueRequestWithContent(contentBlob: Blob, encoded: boolean, responseHeaders: Protocol.Fetch.HeaderEntry[], isBodyOverridden: boolean): Promise<void>;
    continueRequestWithoutChange(): void;
    responseBody(): Promise<TextUtils.ContentData.ContentDataOrError>;
    isRedirect(): boolean;
    /**
     * Tries to determine the MIME type and charset for this intercepted request.
     * Looks at the intercepted response headers first (for Content-Type header), then
     * checks the `NetworkRequest` if we have one.
     */
    getMimeTypeAndCharset(): {
        mimeType: string | null;
        charset: string | null;
    };
}
export declare function networkConditionsEqual(first: ThrottlingConditions, second: ThrottlingConditions): boolean;
/**
 * IMPORTANT: this key is used as the value that is persisted so we remember
 * the user's throttling settings
 *
 * This means that it is very important that;
 * 1. Each Conditions that is defined must have a unique key.
 * 2. The keys & values DO NOT CHANGE for a particular condition, else we might break
 *    DevTools when restoring a user's persisted setting.
 *
 * If you do want to change them, you need to handle that in a migration, but
 * please talk to jacktfranklin@ first.
 */
export declare const enum PredefinedThrottlingConditionKey {
    BLOCKING = "BLOCKING",
    NO_THROTTLING = "NO_THROTTLING",
    OFFLINE = "OFFLINE",
    SPEED_3G = "SPEED_3G",
    SPEED_SLOW_4G = "SPEED_SLOW_4G",
    SPEED_FAST_4G = "SPEED_FAST_4G"
}
export type UserDefinedThrottlingConditionKey = `USER_CUSTOM_SETTING_${number}`;
export type ThrottlingConditionKey = PredefinedThrottlingConditionKey | UserDefinedThrottlingConditionKey;
export declare const THROTTLING_CONDITIONS_LOOKUP: ReadonlyMap<PredefinedThrottlingConditionKey, Conditions>;
export declare function keyIsCustomUser(key: ThrottlingConditionKey): key is UserDefinedThrottlingConditionKey;
export declare function getPredefinedCondition(key: ThrottlingConditionKey): Conditions | null;
export declare function getPredefinedOrBlockingCondition(key: ThrottlingConditionKey): ThrottlingConditions | null;
export type ThrottlingConditions = Conditions | {
    readonly key: ThrottlingConditionKey;
    block: true;
    title: string | (() => string);
};
export interface Conditions {
    readonly key: ThrottlingConditionKey;
    download: number;
    upload: number;
    latency: number;
    packetLoss?: number;
    packetQueueLength?: number;
    packetReordering?: boolean;
    title: string | (() => string);
    i18nTitleKey?: string;
    /**
     * RTT values are multiplied by adjustment factors to make DevTools' emulation more accurate.
     * This value represents the RTT value *before* the adjustment factor is applied.
     * @see https://docs.google.com/document/d/10lfVdS1iDWCRKQXPfbxEn4Or99D64mvNlugP1AQuFlE/edit for historical context.
     */
    targetLatency?: number;
}
export interface Message {
    message: string;
    requestId: string;
    warning: boolean;
}
export interface InterceptionPattern {
    urlPattern: string;
    requestStage: Protocol.Fetch.RequestStage;
}
export type RequestInterceptor = (request: InterceptedRequest) => Promise<void>;
export interface RequestUpdateDroppedEventData {
    url: Platform.DevToolsPath.UrlString;
    frameId: Protocol.Page.FrameId | null;
    loaderId: Protocol.Network.LoaderId;
    resourceType: Protocol.Network.ResourceType;
    mimeType: string;
    lastModified: Date | null;
}
/**
 * For the given Round Trip Time (in MilliSeconds), return the best throttling conditions.
 */
export declare function getRecommendedNetworkPreset(rtt: number): Conditions | null;
