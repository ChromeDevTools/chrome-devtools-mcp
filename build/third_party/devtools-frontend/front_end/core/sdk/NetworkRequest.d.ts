import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { Attribute, type Cookie } from './Cookie.js';
import { SecurityOrigin } from './SecurityOrigin.js';
import { ServerTiming } from './ServerTiming.js';
export declare class NetworkRequest extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements TextUtils.ContentProvider.StreamingContentProvider {
    #private;
    statusCode: number;
    statusText: string;
    requestMethod: string;
    requestTime: number;
    protocol: string;
    alternateProtocolUsage: Protocol.Network.AlternateProtocolUsage | undefined;
    mixedContentType: Protocol.Security.MixedContentType;
    connectionId: string;
    connectionReused: boolean;
    hasNetworkData: boolean;
    localizedFailDescription: string | null;
    responseReceivedPromise?: Promise<void>;
    responseReceivedPromiseResolve?: () => void;
    directSocketInfo?: DirectSocketInfo;
    constructor(requestId: string, backendRequestId: Protocol.Network.RequestId | undefined, url: Platform.DevToolsPath.UrlString, documentURL: Platform.DevToolsPath.UrlString, frameId: Protocol.Page.FrameId | null, loaderId: Protocol.Network.LoaderId | null, initiator: Protocol.Network.Initiator | null, hasUserGesture?: boolean, console?: Common.Console.Console, isImportedHar?: boolean);
    static create(backendRequestId: Protocol.Network.RequestId, url: Platform.DevToolsPath.UrlString, documentURL: Platform.DevToolsPath.UrlString, frameId: Protocol.Page.FrameId | null, loaderId: Protocol.Network.LoaderId | null, initiator: Protocol.Network.Initiator | null, hasUserGesture?: boolean, console?: Common.Console.Console): NetworkRequest;
    static createForSocket(backendRequestId: Protocol.Network.RequestId, requestURL: Platform.DevToolsPath.UrlString, initiator?: Protocol.Network.Initiator, console?: Common.Console.Console): NetworkRequest;
    static createWithoutBackendRequest(requestId: string, url: Platform.DevToolsPath.UrlString, documentURL: Platform.DevToolsPath.UrlString, initiator: Protocol.Network.Initiator | null, console?: Common.Console.Console): NetworkRequest;
    /**
     * Creates a network request representing an entry imported from a HAR file.
     *
     * Use this instead of {@link createWithoutBackendRequest} when importing HAR logs
     * (or testing HAR-imported traffic) so that the request is marked as HAR-imported
     * at construction time and its security origins ({@link requestURLSecurityOrigin}
     * and {@link initiatorSecurityOrigin}) resolve to isolated `imported-har://`
     * virtual origins rather than colliding with live web origins.
     */
    static createForImportedHar(requestId: string, url: Platform.DevToolsPath.UrlString, documentURL: Platform.DevToolsPath.UrlString, initiator: Protocol.Network.Initiator | null, console?: Common.Console.Console): NetworkRequest;
    identityCompare(other: NetworkRequest): number;
    requestId(): string;
    backendRequestId(): Protocol.Network.RequestId | undefined;
    /**
     * Returns the security origin of the target resource URL (`request.url()`) for this network request.
     *
     * For example, if an inspected document at `https://example.com/index.html` initiates a fetch
     * to `https://api.github.com/users`, `requestURLSecurityOrigin()` returns the origin for
     * `https://api.github.com`.
     *
     * For imported HAR files, the origin is mapped to an isolated virtual domain
     * (`imported-har://${authority}`) to ensure recorded network traffic never collides with
     * live web origins.
     *
     * The result is cached, so repeated calls return the same instance until the URL changes.
     * This keeps opaque origins (such as `data:` URLs) same-origin with themselves.
     *
     * @see {@link initiatorSecurityOrigin} to obtain the origin of the document that initiated the request.
     */
    requestURLSecurityOrigin(): SecurityOrigin;
    /**
     * Returns the security origin of the document or context (`request.documentURL`) that initiated
     * this network request.
     *
     * For example, if an inspected document at `https://example.com/index.html` initiates a fetch
     * to `https://api.github.com/users`, `initiatorSecurityOrigin()` returns the origin for
     * `https://example.com`.
     *
     * If `documentURL` is empty, invalid, or an opaque context (such as a `data:` URL or sandboxed
     * iframe), this returns a unique opaque `SecurityOrigin`.
     *
     * For imported HAR files, the origin is mapped to an isolated virtual domain
     * (`imported-har://${authority}`) matching the imported initiating document.
     *
     * The result is cached, so repeated calls return the same instance. This keeps opaque
     * origins same-origin with themselves.
     *
     * @see {@link requestURLSecurityOrigin} to obtain the origin of the target resource URL being requested.
     */
    initiatorSecurityOrigin(): SecurityOrigin;
    url(): Platform.DevToolsPath.UrlString;
    isBlobRequest(): boolean;
    setUrl(x: Platform.DevToolsPath.UrlString): void;
    get documentURL(): Platform.DevToolsPath.UrlString;
    get parsedURL(): Common.ParsedURL.ParsedURL;
    get frameId(): Protocol.Page.FrameId | null;
    get loaderId(): Protocol.Network.LoaderId | null;
    get appliedNetworkConditionsId(): string | undefined;
    setRemoteAddress(ip: string, port: number): void;
    remoteAddress(): string;
    remoteAddressSpace(): Protocol.Network.IPAddressSpace;
    /**
     * The cache #name of the CacheStorage from where the response is served via
     * the ServiceWorker.
     */
    getResponseCacheStorageCacheName(): string | undefined;
    setResponseCacheStorageCacheName(x: string): void;
    serviceWorkerResponseSource(): Protocol.Network.ServiceWorkerResponseSource | undefined;
    setServiceWorkerResponseSource(serviceWorkerResponseSource: Protocol.Network.ServiceWorkerResponseSource): void;
    setReferrerPolicy(referrerPolicy: Protocol.Network.RequestReferrerPolicy): void;
    referrerPolicy(): Protocol.Network.RequestReferrerPolicy | null;
    securityState(): Protocol.Security.SecurityState;
    setSecurityState(securityState: Protocol.Security.SecurityState): void;
    securityDetails(): Protocol.Network.SecurityDetails | null;
    setSecurityDetails(securityDetails: Protocol.Network.SecurityDetails): void;
    get startTime(): number;
    setIssueTime(monotonicTime: number, wallTime: number): void;
    issueTime(): number;
    pseudoWallTime(monotonicTime: number): number;
    get responseReceivedTime(): number;
    set responseReceivedTime(x: number);
    /**
     * The time at which the returned response was generated. For cached
     * responses, this is the last time the cache entry was validated.
     */
    getResponseRetrievalTime(): Date | undefined;
    setResponseRetrievalTime(x: Date): void;
    get endTime(): number;
    set endTime(x: number);
    get duration(): number;
    get latency(): number;
    get resourceSize(): number;
    set resourceSize(x: number);
    get transferSize(): number;
    increaseTransferSize(x: number): void;
    setTransferSize(x: number): void;
    get finished(): boolean;
    set finished(x: boolean);
    get failed(): boolean;
    set failed(x: boolean);
    get canceled(): boolean;
    set canceled(x: boolean);
    get preserved(): boolean;
    set preserved(x: boolean);
    blockedReason(): Protocol.Network.BlockedReason | undefined;
    setBlockedReason(reason: Protocol.Network.BlockedReason): void;
    setRenderBlockingBehavior(renderBlocking: Protocol.Network.RenderBlockingBehavior): void;
    renderBlockingBehavior(): Protocol.Network.RenderBlockingBehavior | undefined;
    corsErrorStatus(): Protocol.Network.CorsErrorStatus | undefined;
    setCorsErrorStatus(corsErrorStatus: Protocol.Network.CorsErrorStatus): void;
    wasBlocked(): boolean;
    cached(): boolean;
    cachedInMemory(): boolean;
    fromPrefetchCache(): boolean;
    setFromMemoryCache(): void;
    get fromDiskCache(): boolean | undefined;
    setFromDiskCache(): void;
    setFromPrefetchCache(): void;
    cacheDisabled(): boolean;
    setCacheDisabled(cacheDisabled: boolean): void;
    fromEarlyHints(): boolean;
    setFromEarlyHints(): void;
    /**
     * Returns true if the request was intercepted by a service worker and it
     * provided its own response.
     */
    get fetchedViaServiceWorker(): boolean;
    set fetchedViaServiceWorker(x: boolean);
    get serviceWorkerRouterInfo(): Protocol.Network.ServiceWorkerRouterInfo | undefined;
    set serviceWorkerRouterInfo(x: Protocol.Network.ServiceWorkerRouterInfo);
    /**
     * Returns true if the request was matched to a route when using the
     * ServiceWorker static routing API.
     */
    hasMatchingServiceWorkerRouter(): boolean;
    /**
     * Returns true if the request was sent by a service worker.
     */
    initiatedByServiceWorker(): boolean;
    get timing(): Protocol.Network.ResourceTiming | undefined;
    set timing(timingInfo: Protocol.Network.ResourceTiming | undefined);
    private setConnectTimingFromExtraInfo;
    get mimeType(): string;
    set mimeType(x: string);
    get displayName(): string;
    name(): string;
    path(): string;
    private parseNameAndPathFromURL;
    get folder(): string;
    get pathname(): string;
    resourceType(): Common.ResourceType.ResourceType;
    setResourceType(resourceType: Common.ResourceType.ResourceType): void;
    get domain(): string;
    get scheme(): string;
    getInferredStatusText(): string;
    redirectSource(): NetworkRequest | null;
    setRedirectSource(originatingRequest: NetworkRequest | null): void;
    preflightRequest(): NetworkRequest | null;
    setPreflightRequest(preflightRequest: NetworkRequest | null): void;
    preflightInitiatorRequest(): NetworkRequest | null;
    setPreflightInitiatorRequest(preflightInitiatorRequest: NetworkRequest | null): void;
    isPreflightRequest(): boolean;
    isPreloadRequest(): boolean;
    redirectDestination(): NetworkRequest | null;
    setRedirectDestination(redirectDestination: NetworkRequest | null): void;
    requestHeaders(): NameValue[];
    setRequestHeaders(headers: NameValue[]): void;
    requestHeadersText(): string | undefined;
    setRequestHeadersText(text: string): void;
    requestHeaderValue(headerName: string): string | undefined;
    requestFormData(): Promise<string | null>;
    setRequestFormData(hasData: boolean, data: string | null): void;
    /**
     * Returns the raw request body as ContentData, preserving base64 encoding
     * for binary payloads. This enables binary viewers (hex, base64, utf-8)
     * in the Payload tab.
     */
    requestFormDataContentData(): Promise<TextUtils.ContentData.ContentDataOrError>;
    private filteredProtocolName;
    requestHttpVersion(): string;
    get responseHeaders(): NameValue[];
    set responseHeaders(x: NameValue[]);
    get earlyHintsHeaders(): NameValue[];
    set earlyHintsHeaders(x: NameValue[]);
    get originalResponseHeaders(): Protocol.Fetch.HeaderEntry[];
    set originalResponseHeaders(headers: Protocol.Fetch.HeaderEntry[]);
    get setCookieHeaders(): Protocol.Fetch.HeaderEntry[];
    set setCookieHeaders(headers: Protocol.Fetch.HeaderEntry[]);
    get responseHeadersText(): string;
    set responseHeadersText(x: string);
    get sortedResponseHeaders(): NameValue[];
    get sortedOriginalResponseHeaders(): NameValue[];
    get overrideTypes(): OverrideType[];
    get hasOverriddenContent(): boolean;
    set hasOverriddenContent(value: boolean);
    hasOverriddenHeaders(): boolean;
    responseHeaderValue(headerName: string): string | undefined;
    wasIntercepted(): boolean;
    setWasIntercepted(wasIntercepted: boolean): void;
    isImportedHar(): boolean;
    setEarlyHintsHeaders(headers: NameValue[]): void;
    get responseCookies(): Cookie[];
    set responseCookies(responseCookies: Cookie[]);
    responseLastModified(): string | undefined;
    allCookiesIncludingBlockedOnes(): Cookie[];
    get serverTimings(): ServerTiming[] | null;
    queryString(): string | null;
    get queryParameters(): NameValue[] | null;
    private parseFormParameters;
    formParameters(): Promise<NameValue[] | null>;
    responseHttpVersion(): string;
    private parseParameters;
    /**
     * Parses multipart/form-data; boundary=boundaryString request bodies -
     * --boundaryString
     * Content-Disposition: form-data; #name="field-#name"; filename="r.gif"
     * Content-Type: application/octet-stream
     *
     * optionalValue
     * --boundaryString
     * Content-Disposition: form-data; #name="field-#name-2"
     *
     * optionalValue2
     * --boundaryString--
     */
    private parseMultipartFormDataParameters;
    private computeHeaderValue;
    requestContentData(): Promise<TextUtils.ContentData.ContentDataOrError>;
    /**
     * Returns the response body without waiting for the request to finish loading.
     *
     * `requestContentData()` waits for `FINISHED_LOADING` when the request has no
     * content data provider. Some requests never finish: Chrome does not send
     * `loadingFinished` for a `Cache-Control: no-store` fetch() whose body the page
     * never reads, and synthetic requests without a provider are never finished at all.
     * Callers that must not block, such as AI context building, use this method instead.
     *
     * Requests with a content data provider (Local Overrides, Cache Storage, HAR
     * imports) resolve even when they have not finished.
     */
    requestContentDataIfAvailable(): Promise<TextUtils.ContentData.ContentDataOrError>;
    setContentDataProvider(dataProvider: () => Promise<TextUtils.ContentData.ContentDataOrError>): void;
    requestStreamingContent(): Promise<TextUtils.StreamingContentData.StreamingContentDataOrError>;
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
    requestContentType(): string | undefined;
    requestContentEncoding(): string | undefined;
    hasErrorStatusCode(): boolean;
    setInitialPriority(priority: Protocol.Network.ResourcePriority): void;
    initialPriority(): Protocol.Network.ResourcePriority | null;
    setPriority(priority: Protocol.Network.ResourcePriority): void;
    priority(): Protocol.Network.ResourcePriority | null;
    setSignedExchangeInfo(info: Protocol.Network.SignedExchangeInfo): void;
    signedExchangeInfo(): Protocol.Network.SignedExchangeInfo | null;
    populateImageSource(image: {
        src: string;
    }): Promise<void>;
    initiator(): Protocol.Network.Initiator | null;
    hasUserGesture(): boolean | null;
    frames(): WebSocketFrame[];
    addProtocolFrameError(errorMessage: string, time: number): void;
    addProtocolFrame(response: Protocol.Network.WebSocketFrame, time: number, sent: boolean): void;
    addFrame(frame: WebSocketFrame): void;
    directSocketChunks(): DirectSocketChunk[];
    addDirectSocketChunk(chunk: DirectSocketChunk): void;
    eventSourceMessages(): readonly EventSourceMessage[];
    addEventSourceMessage(time: number, eventName: string, eventId: string, data: string): void;
    markAsRedirect(redirectCount: number): void;
    isRedirect(): boolean;
    setRequestIdForTest(requestId: Protocol.Network.RequestId): void;
    charset(): string | null;
    setCharset(charset: string): void;
    addExtraRequestInfo(extraRequestInfo: ExtraRequestInfo): void;
    setAppliedNetworkConditions(appliedNetworkConditionsId: string): void;
    getDeviceBoundSessionUsages(): Protocol.Network.DeviceBoundSessionWithUsage[];
    hasExtraRequestInfo(): boolean;
    blockedRequestCookies(): BlockedCookieWithReason[];
    setIncludedRequestCookies(includedRequestCookies: IncludedCookieWithReason[]): void;
    includedRequestCookies(): IncludedCookieWithReason[];
    hasRequestCookies(): boolean;
    siteHasCookieInOtherPartition(): boolean;
    static parseStatusTextFromResponseHeadersText(responseHeadersText: string): string;
    addExtraResponseInfo(extraResponseInfo: ExtraResponseInfo): void;
    hasExtraResponseInfo(): boolean;
    blockedResponseCookies(): BlockedSetCookieWithReason[];
    exemptedResponseCookies(): ExemptedSetCookieWithReason[];
    nonBlockedResponseCookies(): Cookie[];
    responseCookiesPartitionKey(): Protocol.Network.CookiePartitionKey | null;
    responseCookiesPartitionKeyOpaque(): boolean | null;
    redirectSourceSignedExchangeInfoHasNoErrors(): boolean;
    clientSecurityState(): Protocol.Network.ClientSecurityState | undefined;
    setTrustTokenParams(trustTokenParams: Protocol.Network.TrustTokenParams): void;
    trustTokenParams(): Protocol.Network.TrustTokenParams | undefined;
    setTrustTokenOperationDoneEvent(doneEvent: Protocol.Network.TrustTokenOperationDoneEvent): void;
    trustTokenOperationDoneEvent(): Protocol.Network.TrustTokenOperationDoneEvent | undefined;
    setIsSameSite(isSameSite: boolean): void;
    isSameSite(): boolean | null;
    setIsAdRelated(isAdRelated: boolean): void;
    isAdRelated(): boolean;
    setIsLinkPreload(isLinkPreload: boolean): void;
    isLinkPreload(): boolean;
    getAssociatedData(key: string): object | null;
    setAssociatedData(key: string, data: object): void;
    deleteAssociatedData(key: string): void;
    hasThirdPartyCookiePhaseoutIssue(): boolean;
    addDataReceivedEvent({ timestamp, dataLength, encodedDataLength, data, }: Protocol.Network.DataReceivedEvent): void;
    waitForResponseReceived(): Promise<void>;
}
export declare enum Events {
    FINISHED_LOADING = "FinishedLoading",
    TIMING_CHANGED = "TimingChanged",
    REMOTE_ADDRESS_CHANGED = "RemoteAddressChanged",
    REQUEST_HEADERS_CHANGED = "RequestHeadersChanged",
    RESPONSE_HEADERS_CHANGED = "ResponseHeadersChanged",
    WEBSOCKET_FRAME_ADDED = "WebsocketFrameAdded",
    DIRECTSOCKET_CHUNK_ADDED = "DirectsocketChunkAdded",
    EVENT_SOURCE_MESSAGE_ADDED = "EventSourceMessageAdded",
    TRUST_TOKEN_RESULT_ADDED = "TrustTokenResultAdded"
}
export interface EventTypes {
    [Events.FINISHED_LOADING]: NetworkRequest;
    [Events.TIMING_CHANGED]: NetworkRequest;
    [Events.REMOTE_ADDRESS_CHANGED]: NetworkRequest;
    [Events.REQUEST_HEADERS_CHANGED]: void;
    [Events.RESPONSE_HEADERS_CHANGED]: void;
    [Events.WEBSOCKET_FRAME_ADDED]: WebSocketFrame;
    [Events.DIRECTSOCKET_CHUNK_ADDED]: DirectSocketChunk;
    [Events.EVENT_SOURCE_MESSAGE_ADDED]: EventSourceMessage;
    [Events.TRUST_TOKEN_RESULT_ADDED]: void;
}
export declare const enum InitiatorType {
    OTHER = "other",
    PARSER = "parser",
    REDIRECT = "redirect",
    SCRIPT = "script",
    PRELOAD = "preload",
    SIGNED_EXCHANGE = "signedExchange",
    PREFLIGHT = "preflight"
}
export declare enum WebSocketFrameType {
    Send = "send",
    Receive = "receive",
    Error = "error"
}
export declare const cookieExemptionReasonToUiString: (exemptionReason: Protocol.Network.CookieExemptionReason) => string;
export declare const cookieBlockedReasonToUiString: (blockedReason: Protocol.Network.CookieBlockedReason) => string;
export declare const setCookieBlockedReasonToUiString: (blockedReason: Protocol.Network.SetCookieBlockedReason) => string;
export declare const cookieBlockedReasonToAttribute: (blockedReason: Protocol.Network.CookieBlockedReason) => Attribute | null;
export declare const setCookieBlockedReasonToAttribute: (blockedReason: Protocol.Network.SetCookieBlockedReason) => Attribute | null;
export interface NameValue {
    name: string;
    value: string;
}
export interface WebSocketFrame {
    type: WebSocketFrameType;
    time: number;
    text: string;
    opCode: number;
    mask: boolean;
}
export interface BlockedSetCookieWithReason {
    blockedReasons: Protocol.Network.SetCookieBlockedReason[];
    cookieLine: string;
    cookie: Cookie | null;
}
export interface BlockedCookieWithReason {
    cookie: Cookie;
    blockedReasons: Protocol.Network.CookieBlockedReason[];
}
export interface IncludedCookieWithReason {
    cookie: Cookie;
    exemptionReason?: Protocol.Network.CookieExemptionReason;
}
export interface ExemptedSetCookieWithReason {
    cookie: Cookie;
    cookieLine: string;
    exemptionReason: Protocol.Network.CookieExemptionReason;
}
export interface EventSourceMessage {
    time: number;
    eventName: string;
    eventId: string;
    data: string;
}
export interface ExtraRequestInfo {
    blockedRequestCookies: Array<{
        blockedReasons: Protocol.Network.CookieBlockedReason[];
        cookie: Cookie;
    }>;
    requestHeaders: NameValue[];
    includedRequestCookies: IncludedCookieWithReason[];
    deviceBoundSessionUsages?: Protocol.Network.DeviceBoundSessionWithUsage[];
    clientSecurityState?: Protocol.Network.ClientSecurityState;
    connectTiming: Protocol.Network.ConnectTiming;
    siteHasCookieInOtherPartition?: boolean;
    appliedNetworkConditionsId?: string;
}
export interface ExtraResponseInfo {
    blockedResponseCookies: Array<{
        blockedReasons: Protocol.Network.SetCookieBlockedReason[];
        cookieLine: string;
        cookie: Cookie | null;
    }>;
    responseHeaders: NameValue[];
    responseHeadersText?: string;
    resourceIPAddressSpace: Protocol.Network.IPAddressSpace;
    statusCode: number | undefined;
    cookiePartitionKey?: Protocol.Network.CookiePartitionKey;
    cookiePartitionKeyOpaque: boolean | undefined;
    exemptedResponseCookies: Array<{
        cookie: Cookie;
        cookieLine: string;
        exemptionReason: Protocol.Network.CookieExemptionReason;
    }> | undefined;
}
export interface EarlyHintsInfo {
    responseHeaders: NameValue[];
}
export type OverrideType = 'content' | 'headers';
export declare enum DirectSocketType {
    TCP = 1,
    UDP_BOUND = 2,
    UDP_CONNECTED = 3
}
export declare enum DirectSocketStatus {
    OPENING = 1,
    OPEN = 2,
    CLOSED = 3,
    ABORTED = 4
}
export interface DirectSocketCreateOptions {
    remoteAddr?: string;
    remotePort?: number;
    localAddr?: string;
    localPort?: number;
    noDelay?: boolean;
    keepAliveDelay?: number;
    sendBufferSize?: number;
    receiveBufferSize?: number;
    dnsQueryType?: Protocol.Network.DirectSocketDnsQueryType;
    multicastLoopback?: boolean;
    multicastTimeToLive?: number;
    multicastAllowAddressSharing?: boolean;
}
export interface DirectSocketOpenInfo {
    remoteAddr?: string;
    remotePort?: number;
    localAddr?: string;
    localPort?: number;
}
export interface DirectSocketInfo {
    type: DirectSocketType;
    status: DirectSocketStatus;
    errorMessage?: string;
    createOptions: DirectSocketCreateOptions;
    openInfo?: DirectSocketOpenInfo;
    joinedMulticastGroups?: Set<string>;
}
export interface DirectSocketChunk {
    data: string;
    type: DirectSocketChunkType;
    timestamp: number;
    remoteAddress?: string;
    remotePort?: number;
}
export declare enum DirectSocketChunkType {
    SEND = "send",
    RECEIVE = "receive"
}
