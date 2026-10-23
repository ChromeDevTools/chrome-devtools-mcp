// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { CookieModel } from './CookieModel.js';
import { CookieParser } from './CookieParser.js';
import * as HttpReasonPhraseStrings from './HttpReasonPhraseStrings.js';
import { Events as NetworkManagerEvents, NetworkManager, } from './NetworkManager.js';
import { SecurityOrigin } from './SecurityOrigin.js';
import { ServerSentEvents } from './ServerSentEvents.js';
import { ServerTiming } from './ServerTiming.js';
import { Type } from './Target.js';
// clang-format off
const UIStrings = {
    /**
     * @description Label for binary data format.
     */
    binary: '(binary)',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    secureOnly: 'This cookie was blocked because it had the "`Secure`" attribute and the connection wasn’t secure',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    notOnPath: 'This cookie was blocked because its path wasn’t an exact match for or a superdirectory of the request URL’s path',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    domainMismatch: 'This cookie was blocked because neither did the request URL’s domain exactly match the cookie’s domain, nor was the request URL’s domain a subdomain of the cookie’s Domain attribute value',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    sameSiteStrict: 'This cookie was blocked because it had the "`SameSite=Strict`" attribute and the request was made from a different site. This includes top-level navigation requests initiated by other sites.',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    sameSiteLax: 'This cookie was blocked because it had the "`SameSite=Lax`" attribute and the request was made from a different site and wasn’t initiated by a top-level navigation',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    sameSiteUnspecifiedTreatedAsLax: 'This cookie didn’t specify a "`SameSite`" attribute when it was stored and was defaulted to "`SameSite=Lax`", and was blocked because the request was made from a different site and wasn’t initiated by a top-level navigation. The cookie had to have been set with "`SameSite=None`" to enable cross-site usage.',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    sameSiteNoneInsecure: 'This cookie was blocked because it had the "`SameSite=None`" attribute but wasn’t marked "`Secure`". Cookies without SameSite restrictions must be marked "`Secure`" and sent over a secure connection.',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    userPreferences: 'This cookie was blocked due to user preferences',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    thirdPartyPhaseout: 'This cookie was blocked either because of Chrome flags or browser configuration. Learn more in the Issues panel.',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    unknownError: 'An unknown error was encountered when trying to send this cookie',
    /**
     * @description Tooltip to explain why a cookie was blocked due to exceeding the maximum size.
     */
    nameValuePairExceedsMaxSize: 'This cookie was blocked because it was too large. The combined size of the name and value must be less than or equal to 4096 characters.',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via `Set-Cookie` HTTP header on a request's response was blocked.
     */
    thisSetcookieWasBlockedDueToUser: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked due to user preferences',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via `Set-Cookie` HTTP header on a request's response was blocked.
     */
    thisSetcookieWasBlockedDueThirdPartyPhaseout: 'Setting this cookie was blocked either because of Chrome flags or browser configuration. Learn more in the Issues panel.',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via `Set-Cookie` HTTP header on a request's response was blocked.
     */
    thisSetcookieHadInvalidSyntax: 'This "`Set-Cookie`" header had invalid syntax',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    thisSetcookieHadADisallowedCharacter: 'This "`Set-Cookie`" header contained a disallowed character (a forbidden ASCII control character, or the tab character if it appears in the middle of the cookie name, value, an attribute name, or an attribute value)',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    theSchemeOfThisConnectionIsNot: 'The scheme of this connection isn’t allowed to store cookies',
    /**
     * @description Tooltip to explain why a cookie was blocked.
     */
    anUnknownErrorWasEncounteredWhenTrying: 'An unknown error was encountered when trying to store this cookie',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via a `Set-Cookie` HTTP header on a request's response was blocked.
     */
    blockedReasonSecureOnly: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked because it had the "`Secure`" attribute but wasn’t received over a secure connection',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via a `Set-Cookie` HTTP header on a request's response was blocked.
     * @example {SameSite=Strict} PH1
     */
    blockedReasonSameSiteStrictLax: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked because it had the "{PH1}" attribute but came from a cross-site response which wasn’t the response to a top-level navigation',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via a `Set-Cookie` HTTP header on a request's response was blocked.
     */
    blockedReasonSameSiteUnspecifiedTreatedAsLax: 'This "`Set-Cookie`" header didn’t specify a "`SameSite`" attribute and was defaulted to "`SameSite=Lax`", and was blocked because it came from a cross-site response which wasn’t the response to a top-level navigation. The "`Set-Cookie`" header had to have been set with "`SameSite=None`" to enable cross-site usage.',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via a `Set-Cookie` HTTP header on a request's response was blocked.
     */
    blockedReasonSameSiteNoneInsecure: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked because it had the "`SameSite=None`" attribute but didn’t have the "`Secure`" attribute, which is required in order to use "`SameSite=None`"',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via a `Set-Cookie` HTTP header on a request's response was blocked.
     */
    blockedReasonOverwriteSecure: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked because it wasn’t sent over a secure connection and would have overwritten a cookie with the "`Secure`" attribute',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via a `Set-Cookie` HTTP header on a request's response was blocked.
     */
    blockedReasonInvalidDomain: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked because its "`Domain`" attribute was invalid with regards to the current host URL',
    /**
     * @description Tooltip to explain why an attempt to set a cookie via a `Set-Cookie` HTTP header on a request's response was blocked.
     */
    blockedReasonInvalidPrefix: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked because it used the "`__Secure-`" or "`__Host-`" prefix in its name and broke the additional rules applied to cookies with these prefixes as defined in `https://tools.ietf.org/html/draft-west-cookie-prefixes-05`',
    /**
     * @description Tooltip to explain why a cookie was blocked when the size of the #name plus the size of the value exceeds the max size.
     */
    thisSetcookieWasBlockedBecauseTheNameValuePairExceedsMaxSize: 'This attempt to set a cookie via a "`Set-Cookie`" header was blocked because the cookie was too large. The combined size of the name and value must be less than or equal to 4096 characters.',
    /**
     * @description Warning message when Set-Cookie header is ignored due to size limit.
     * @example {https://example.com} PH1
     */
    setcookieHeaderIsIgnoredIn: '"`Set-Cookie`" header is ignored in response from URL: {PH1}. The combined size of the name and value must be less than or equal to 4096 characters.',
    /**
     * @description Tooltip to explain why the cookie should have been blocked by third-party cookie phaseout but is exempted.
     */
    exemptionReasonUserSetting: 'This cookie is allowed by user preference',
    /**
     * @description Tooltip to explain why the cookie should have been blocked by third-party cookie phaseout but is exempted.
     */
    exemptionReasonEnterprisePolicy: 'This cookie is allowed by Chrome Enterprise policy. Learn more: goo.gle/ce-3pc',
    /**
     * @description Tooltip to explain why the cookie should have been blocked by third-party cookie phaseout but is exempted.
     */
    exemptionReasonStorageAccessAPI: 'This cookie is allowed by the Storage Access API. Learn more: goo.gle/saa',
    /**
     * @description Tooltip to explain why the cookie should have been blocked by third-party cookie phaseout but is exempted.
     */
    exemptionReasonTopLevelStorageAccessAPI: 'This cookie is allowed by the top-level Storage Access API. Learn more: goo.gle/saa-top',
    /**
     * @description Tooltip to explain why the cookie should have been blocked by third-party cookie phaseout but is exempted.
     */
    exemptionReasonScheme: 'This cookie is allowed by the top-level URL scheme',
};
// clang-format on
const str_ = i18n.i18n.registerUIStrings('core/sdk/NetworkRequest.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class NetworkRequest extends Common.ObjectWrapper.ObjectWrapper {
    #requestId;
    #backendRequestId;
    #documentURL;
    #frameId;
    #loaderId;
    #hasUserGesture;
    #initiator;
    #redirectSource = null;
    #preflightRequest = null;
    #preflightInitiatorRequest = null;
    #isRedirect = false;
    #redirectDestination = null;
    #issueTime = -1;
    #startTime = -1;
    #endTime = -1;
    #blockedReason = undefined;
    #renderBlockingBehavior;
    #initiatorSecurityOrigin;
    #requestURLSecurityOrigin;
    #corsErrorStatus = undefined;
    statusCode = 0;
    statusText = '';
    requestMethod = '';
    requestTime = 0;
    protocol = '';
    alternateProtocolUsage = undefined;
    mixedContentType = "none" /* Protocol.Security.MixedContentType.None */;
    #initialPriority = null;
    #currentPriority = null;
    #signedExchangeInfo = null;
    #resourceType = Common.ResourceType.resourceTypes.Other;
    #contentData = null;
    #streamingContentData = null;
    #resolvedStreamingContentData = null;
    #frames = [];
    #responseHeaderValues = {};
    #responseHeadersText = '';
    #originalResponseHeaders = [];
    #sortedOriginalResponseHeaders;
    // This field is only used when intercepting and overriding requests, because
    // in that case 'this.responseHeaders' does not contain 'set-cookie' headers.
    #setCookieHeaders = [];
    #requestHeaders = [];
    #requestHeaderValues = {};
    #remoteAddress = '';
    #remoteAddressSpace = "Unknown" /* Protocol.Network.IPAddressSpace.Unknown */;
    #referrerPolicy = null;
    #securityState = "unknown" /* Protocol.Security.SecurityState.Unknown */;
    #securityDetails = null;
    connectionId = '0';
    connectionReused = false;
    hasNetworkData = false;
    #formParametersPromise = null;
    #requestFormDataPromise = Promise.resolve(null);
    #hasExtraRequestInfo = false;
    #hasExtraResponseInfo = false;
    #blockedRequestCookies = [];
    #includedRequestCookies = [];
    #blockedResponseCookies = [];
    #exemptedResponseCookies = [];
    #responseCookiesPartitionKey = null;
    #responseCookiesPartitionKeyOpaque = null;
    #deviceBoundSessionUsages = [];
    #siteHasCookieInOtherPartition = false;
    localizedFailDescription = null;
    #url;
    #responseReceivedTime;
    #transferSize;
    #finished;
    #failed;
    #canceled;
    #preserved;
    #mimeType;
    #charset;
    #parsedURL;
    #name;
    #path;
    #clientSecurityState;
    #trustTokenParams;
    #trustTokenOperationDoneEvent;
    #responseCacheStorageCacheName;
    #serviceWorkerResponseSource;
    #wallIssueTime;
    #responseRetrievalTime;
    #resourceSize;
    #fromMemoryCache;
    #fromDiskCache;
    #fromPrefetchCache;
    #cacheDisabled = false;
    #fromEarlyHints;
    #fetchedViaServiceWorker;
    #serviceWorkerRouterInfo;
    #timing;
    #requestHeadersText;
    #responseHeaders;
    #earlyHintsHeaders;
    #sortedResponseHeaders;
    #responseCookies;
    #serverTimings;
    #queryString;
    #parsedQueryParameters;
    #contentDataProvider;
    #isSameSite = null;
    #wasIntercepted = false;
    /**
     * Whether this request was imported from a HAR file.
     */
    #isImportedHar;
    #associatedData = new Map();
    #hasOverriddenContent = false;
    #hasThirdPartyCookiePhaseoutIssue = false;
    #serverSentEvents;
    responseReceivedPromise;
    responseReceivedPromiseResolve;
    directSocketInfo;
    #directSocketChunks = [];
    #isAdRelated;
    #isLinkPreload;
    #appliedNetworkConditionsId;
    #console;
    constructor(requestId, backendRequestId, url, documentURL, frameId, loaderId, initiator, hasUserGesture, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    console = Common.Console.Console.instance(), isImportedHar = false) {
        super();
        this.#requestId = requestId;
        this.#backendRequestId = backendRequestId;
        this.setUrl(url);
        this.#documentURL = documentURL;
        this.#frameId = frameId;
        this.#loaderId = loaderId;
        this.#initiator = initiator;
        this.#hasUserGesture = hasUserGesture;
        this.#isAdRelated = false;
        this.#isLinkPreload = false;
        this.#console = console;
        this.#isImportedHar = isImportedHar;
    }
    static create(backendRequestId, url, documentURL, frameId, loaderId, initiator, hasUserGesture, console) {
        return new NetworkRequest(backendRequestId, backendRequestId, url, documentURL, frameId, loaderId, initiator, hasUserGesture, console);
    }
    static createForSocket(backendRequestId, requestURL, initiator, console) {
        return new NetworkRequest(backendRequestId, backendRequestId, requestURL, Platform.DevToolsPath.EmptyUrlString, null, null, initiator || null, undefined, console);
    }
    static createWithoutBackendRequest(requestId, url, documentURL, initiator, console) {
        return new NetworkRequest(requestId, undefined, url, documentURL, null, null, initiator, undefined, console);
    }
    /**
     * Creates a network request representing an entry imported from a HAR file.
     *
     * Use this instead of {@link createWithoutBackendRequest} when importing HAR logs
     * (or testing HAR-imported traffic) so that the request is marked as HAR-imported
     * at construction time and its security origins ({@link requestURLSecurityOrigin}
     * and {@link initiatorSecurityOrigin}) resolve to isolated `imported-har://`
     * virtual origins rather than colliding with live web origins.
     */
    static createForImportedHar(requestId, url, documentURL, initiator, console) {
        return new NetworkRequest(requestId, undefined, url, documentURL, null, null, initiator, undefined, console, true);
    }
    identityCompare(other) {
        const thisId = this.requestId();
        const thatId = other.requestId();
        if (thisId > thatId) {
            return 1;
        }
        if (thisId < thatId) {
            return -1;
        }
        return 0;
    }
    requestId() {
        return this.#requestId;
    }
    backendRequestId() {
        return this.#backendRequestId;
    }
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
    requestURLSecurityOrigin() {
        if (!this.#requestURLSecurityOrigin) {
            this.#requestURLSecurityOrigin = this.#resolveSecurityOrigin(this.#url);
        }
        return this.#requestURLSecurityOrigin;
    }
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
    initiatorSecurityOrigin() {
        if (!this.#initiatorSecurityOrigin) {
            this.#initiatorSecurityOrigin = this.#resolveSecurityOrigin(this.#documentURL);
        }
        return this.#initiatorSecurityOrigin;
    }
    #resolveSecurityOrigin(url) {
        if (this.#isImportedHar) {
            const parsed = Common.ParsedURL.ParsedURL.fromString(url);
            if (!parsed || !parsed.host) {
                return SecurityOrigin.createUniqueOpaque();
            }
            const authority = parsed.host + (parsed.port ? ':' + parsed.port : '');
            return SecurityOrigin.create(`imported-har://${authority}`);
        }
        return SecurityOrigin.create(url);
    }
    url() {
        return this.#url;
    }
    isBlobRequest() {
        return Common.ParsedURL.schemeIs(this.#url, 'blob:');
    }
    setUrl(x) {
        if (this.#url === x) {
            return;
        }
        this.#url = x;
        this.#parsedURL = new Common.ParsedURL.ParsedURL(x);
        this.#queryString = undefined;
        this.#parsedQueryParameters = undefined;
        this.#name = undefined;
        this.#path = undefined;
        this.#requestURLSecurityOrigin = undefined;
    }
    get documentURL() {
        return this.#documentURL;
    }
    get parsedURL() {
        return this.#parsedURL;
    }
    get frameId() {
        return this.#frameId;
    }
    get loaderId() {
        return this.#loaderId;
    }
    get appliedNetworkConditionsId() {
        return this.#appliedNetworkConditionsId;
    }
    setRemoteAddress(ip, port) {
        this.#remoteAddress = ip + ':' + port;
        this.dispatchEventToListeners(Events.REMOTE_ADDRESS_CHANGED, this);
    }
    remoteAddress() {
        return this.#remoteAddress;
    }
    remoteAddressSpace() {
        return this.#remoteAddressSpace;
    }
    /**
     * The cache #name of the CacheStorage from where the response is served via
     * the ServiceWorker.
     */
    getResponseCacheStorageCacheName() {
        return this.#responseCacheStorageCacheName;
    }
    setResponseCacheStorageCacheName(x) {
        this.#responseCacheStorageCacheName = x;
    }
    serviceWorkerResponseSource() {
        return this.#serviceWorkerResponseSource;
    }
    setServiceWorkerResponseSource(serviceWorkerResponseSource) {
        this.#serviceWorkerResponseSource = serviceWorkerResponseSource;
    }
    setReferrerPolicy(referrerPolicy) {
        this.#referrerPolicy = referrerPolicy;
    }
    referrerPolicy() {
        return this.#referrerPolicy;
    }
    securityState() {
        return this.#securityState;
    }
    setSecurityState(securityState) {
        this.#securityState = securityState;
    }
    securityDetails() {
        return this.#securityDetails;
    }
    setSecurityDetails(securityDetails) {
        this.#securityDetails = securityDetails;
    }
    get startTime() {
        return this.#startTime || -1;
    }
    setIssueTime(monotonicTime, wallTime) {
        this.#issueTime = monotonicTime;
        this.#wallIssueTime = wallTime;
        this.#startTime = monotonicTime;
    }
    issueTime() {
        return this.#issueTime;
    }
    pseudoWallTime(monotonicTime) {
        return this.#wallIssueTime ? this.#wallIssueTime - this.#issueTime + monotonicTime : monotonicTime;
    }
    get responseReceivedTime() {
        return this.#responseReceivedTime || -1;
    }
    set responseReceivedTime(x) {
        this.#responseReceivedTime = x;
    }
    /**
     * The time at which the returned response was generated. For cached
     * responses, this is the last time the cache entry was validated.
     */
    getResponseRetrievalTime() {
        return this.#responseRetrievalTime;
    }
    setResponseRetrievalTime(x) {
        this.#responseRetrievalTime = x;
    }
    get endTime() {
        return this.#endTime || -1;
    }
    set endTime(x) {
        if (this.timing?.requestTime) {
            // Check against accurate responseReceivedTime.
            this.#endTime = Math.max(x, this.responseReceivedTime);
        }
        else {
            // Prefer endTime since it might be from the network stack.
            this.#endTime = x;
            if (this.#responseReceivedTime > x) {
                this.#responseReceivedTime = x;
            }
        }
        this.dispatchEventToListeners(Events.TIMING_CHANGED, this);
    }
    get duration() {
        if (this.#endTime === -1 || this.#startTime === -1) {
            return -1;
        }
        return this.#endTime - this.#startTime;
    }
    get latency() {
        if (this.#responseReceivedTime === -1 || this.#startTime === -1) {
            return -1;
        }
        return this.#responseReceivedTime - this.#startTime;
    }
    get resourceSize() {
        return this.#resourceSize || 0;
    }
    set resourceSize(x) {
        this.#resourceSize = x;
    }
    get transferSize() {
        return this.#transferSize || 0;
    }
    increaseTransferSize(x) {
        this.#transferSize = (this.#transferSize || 0) + x;
    }
    setTransferSize(x) {
        this.#transferSize = x;
    }
    get finished() {
        return this.#finished;
    }
    set finished(x) {
        if (this.#finished === x) {
            return;
        }
        this.#finished = x;
        if (x) {
            this.dispatchEventToListeners(Events.FINISHED_LOADING, this);
        }
    }
    get failed() {
        return this.#failed;
    }
    set failed(x) {
        this.#failed = x;
    }
    get canceled() {
        return this.#canceled;
    }
    set canceled(x) {
        this.#canceled = x;
    }
    get preserved() {
        return this.#preserved;
    }
    set preserved(x) {
        this.#preserved = x;
    }
    blockedReason() {
        return this.#blockedReason;
    }
    setBlockedReason(reason) {
        this.#blockedReason = reason;
    }
    setRenderBlockingBehavior(renderBlocking) {
        this.#renderBlockingBehavior = renderBlocking;
    }
    renderBlockingBehavior() {
        return this.#renderBlockingBehavior;
    }
    corsErrorStatus() {
        return this.#corsErrorStatus;
    }
    setCorsErrorStatus(corsErrorStatus) {
        this.#corsErrorStatus = corsErrorStatus;
    }
    wasBlocked() {
        return Boolean(this.#blockedReason);
    }
    cached() {
        return ((Boolean(this.#fromMemoryCache) || Boolean(this.#fromDiskCache)) && !this.#transferSize);
    }
    cachedInMemory() {
        return Boolean(this.#fromMemoryCache) && !this.#transferSize;
    }
    fromPrefetchCache() {
        return Boolean(this.#fromPrefetchCache);
    }
    setFromMemoryCache() {
        this.#fromMemoryCache = true;
        this.#timing = undefined;
    }
    get fromDiskCache() {
        return this.#fromDiskCache;
    }
    setFromDiskCache() {
        this.#fromDiskCache = true;
    }
    setFromPrefetchCache() {
        this.#fromPrefetchCache = true;
    }
    cacheDisabled() {
        return this.#cacheDisabled;
    }
    setCacheDisabled(cacheDisabled) {
        this.#cacheDisabled = cacheDisabled;
    }
    fromEarlyHints() {
        return Boolean(this.#fromEarlyHints);
    }
    setFromEarlyHints() {
        this.#fromEarlyHints = true;
    }
    /**
     * Returns true if the request was intercepted by a service worker and it
     * provided its own response.
     */
    get fetchedViaServiceWorker() {
        return Boolean(this.#fetchedViaServiceWorker);
    }
    set fetchedViaServiceWorker(x) {
        this.#fetchedViaServiceWorker = x;
    }
    get serviceWorkerRouterInfo() {
        return this.#serviceWorkerRouterInfo;
    }
    set serviceWorkerRouterInfo(x) {
        this.#serviceWorkerRouterInfo = x;
    }
    /**
     * Returns true if the request was matched to a route when using the
     * ServiceWorker static routing API.
     */
    hasMatchingServiceWorkerRouter() {
        // See definitions in `browser_protocol.pdl` for justification.
        return (this.#serviceWorkerRouterInfo !== undefined && this.serviceWorkerRouterInfo?.matchedSourceType !== undefined);
    }
    /**
     * Returns true if the request was sent by a service worker.
     */
    initiatedByServiceWorker() {
        const networkManager = NetworkManager.forRequest(this);
        if (!networkManager) {
            return false;
        }
        return networkManager.target().type() === Type.ServiceWorker;
    }
    get timing() {
        return this.#timing;
    }
    set timing(timingInfo) {
        if (!timingInfo || this.#fromMemoryCache) {
            return;
        }
        // Take startTime and responseReceivedTime from timing data for better accuracy.
        // Timing's requestTime is a baseline in seconds, rest of the numbers there are ticks in millis.
        this.#startTime = timingInfo.requestTime;
        const headersReceivedTime = timingInfo.requestTime + timingInfo.receiveHeadersEnd / 1000.0;
        if ((this.#responseReceivedTime || -1) < 0 || this.#responseReceivedTime > headersReceivedTime) {
            this.#responseReceivedTime = headersReceivedTime;
        }
        if (this.#startTime > this.#responseReceivedTime) {
            this.#responseReceivedTime = this.#startTime;
        }
        this.#timing = timingInfo;
        this.dispatchEventToListeners(Events.TIMING_CHANGED, this);
    }
    setConnectTimingFromExtraInfo(connectTiming) {
        this.#startTime = connectTiming.requestTime;
        this.dispatchEventToListeners(Events.TIMING_CHANGED, this);
    }
    get mimeType() {
        return this.#mimeType;
    }
    set mimeType(x) {
        this.#mimeType = x;
        if (x === "text/event-stream" /* Platform.MimeType.MimeType.EVENTSTREAM */ && !this.#serverSentEvents) {
            const parseFromStreamedData = this.resourceType() !== Common.ResourceType.resourceTypes.EventSource;
            this.#serverSentEvents = new ServerSentEvents(this, parseFromStreamedData);
        }
    }
    get displayName() {
        return this.#parsedURL.displayName;
    }
    name() {
        if (this.#name) {
            return this.#name;
        }
        this.parseNameAndPathFromURL();
        return this.#name;
    }
    path() {
        if (this.#path) {
            return this.#path;
        }
        this.parseNameAndPathFromURL();
        return this.#path;
    }
    parseNameAndPathFromURL() {
        if (this.#parsedURL.isDataURL()) {
            this.#name = this.#parsedURL.dataURLDisplayName();
            this.#path = '';
        }
        else if (this.#parsedURL.isBlobURL()) {
            this.#name = this.#parsedURL.url;
            this.#path = '';
        }
        else if (this.#parsedURL.isAboutBlank()) {
            this.#name = this.#parsedURL.url;
            this.#path = '';
        }
        else {
            this.#path = this.#parsedURL.host + this.#parsedURL.folderPathComponents;
            const networkManager = NetworkManager.forRequest(this);
            const inspectedURL = networkManager ? Common.ParsedURL.ParsedURL.fromString(networkManager.target().inspectedURL()) :
                null;
            this.#path = Platform.StringUtilities.trimURL(this.#path, inspectedURL ? inspectedURL.host : '');
            if (this.#parsedURL.lastPathComponent || this.#parsedURL.queryParams) {
                this.#name =
                    this.#parsedURL.lastPathComponent + (this.#parsedURL.queryParams ? '?' + this.#parsedURL.queryParams : '');
            }
            else if (this.#parsedURL.folderPathComponents) {
                this.#name = this.#parsedURL.folderPathComponents.substring(this.#parsedURL.folderPathComponents.lastIndexOf('/') + 1) +
                    '/';
                this.#path = this.#path.substring(0, this.#path.lastIndexOf('/'));
            }
            else {
                this.#name = this.#parsedURL.host;
                this.#path = '';
            }
        }
    }
    get folder() {
        let path = this.#parsedURL.path;
        const indexOfQuery = path.indexOf('?');
        if (indexOfQuery !== -1) {
            path = path.substring(0, indexOfQuery);
        }
        const lastSlashIndex = path.lastIndexOf('/');
        return lastSlashIndex !== -1 ? path.substring(0, lastSlashIndex) : '';
    }
    get pathname() {
        return this.#parsedURL.path;
    }
    resourceType() {
        return this.#resourceType;
    }
    setResourceType(resourceType) {
        this.#resourceType = resourceType;
    }
    get domain() {
        return this.#parsedURL.host;
    }
    get scheme() {
        return this.#parsedURL.scheme;
    }
    getInferredStatusText() {
        return (this.statusText || HttpReasonPhraseStrings.getStatusText(this.statusCode));
    }
    redirectSource() {
        return this.#redirectSource;
    }
    setRedirectSource(originatingRequest) {
        this.#redirectSource = originatingRequest;
    }
    preflightRequest() {
        return this.#preflightRequest;
    }
    setPreflightRequest(preflightRequest) {
        this.#preflightRequest = preflightRequest;
    }
    preflightInitiatorRequest() {
        return this.#preflightInitiatorRequest;
    }
    setPreflightInitiatorRequest(preflightInitiatorRequest) {
        this.#preflightInitiatorRequest = preflightInitiatorRequest;
    }
    isPreflightRequest() {
        return (this.#initiator !== null && this.#initiator !== undefined &&
            this.#initiator.type === "preflight" /* Protocol.Network.InitiatorType.Preflight */);
    }
    isPreloadRequest() {
        return (this.#initiator !== null && this.#initiator !== undefined &&
            this.#initiator.type === "preload" /* Protocol.Network.InitiatorType.Preload */);
    }
    redirectDestination() {
        return this.#redirectDestination;
    }
    setRedirectDestination(redirectDestination) {
        this.#redirectDestination = redirectDestination;
    }
    requestHeaders() {
        return this.#requestHeaders;
    }
    setRequestHeaders(headers) {
        this.#requestHeaders = headers;
        this.dispatchEventToListeners(Events.REQUEST_HEADERS_CHANGED);
    }
    requestHeadersText() {
        return this.#requestHeadersText;
    }
    setRequestHeadersText(text) {
        this.#requestHeadersText = text;
        this.dispatchEventToListeners(Events.REQUEST_HEADERS_CHANGED);
    }
    requestHeaderValue(headerName) {
        if (this.#requestHeaderValues[headerName]) {
            return this.#requestHeaderValues[headerName];
        }
        this.#requestHeaderValues[headerName] = this.computeHeaderValue(this.requestHeaders(), headerName);
        return this.#requestHeaderValues[headerName];
    }
    requestFormData() {
        if (!this.#requestFormDataPromise) {
            this.#requestFormDataPromise = NetworkManager.requestPostData(this);
        }
        return this.#requestFormDataPromise;
    }
    setRequestFormData(hasData, data) {
        this.#requestFormDataPromise = hasData && data === null ? null : Promise.resolve(data);
        this.#formParametersPromise = null;
    }
    /**
     * Returns the raw request body as ContentData, preserving base64 encoding
     * for binary payloads. This enables binary viewers (hex, base64, utf-8)
     * in the Payload tab.
     */
    requestFormDataContentData() {
        return NetworkManager.requestPostDataContentData(this);
    }
    filteredProtocolName() {
        const protocol = this.protocol.toLowerCase();
        if (protocol === 'h2') {
            return 'http/2.0';
        }
        return protocol.replace(/^http\/2(\.0)?\+/, 'http/2.0+');
    }
    requestHttpVersion() {
        const headersText = this.requestHeadersText();
        if (!headersText) {
            const version = this.requestHeaderValue('version') || this.requestHeaderValue(':version');
            if (version) {
                return version;
            }
            return this.filteredProtocolName();
        }
        const firstLine = headersText.split(/\r\n/)[0];
        const match = firstLine.match(/(HTTP\/\d+\.\d+)$/);
        return match ? match[1] : 'HTTP/0.9';
    }
    get responseHeaders() {
        return this.#responseHeaders || [];
    }
    set responseHeaders(x) {
        this.#responseHeaders = x;
        this.#sortedResponseHeaders = undefined;
        this.#serverTimings = undefined;
        this.#responseCookies = undefined;
        this.#responseHeaderValues = {};
        this.dispatchEventToListeners(Events.RESPONSE_HEADERS_CHANGED);
    }
    get earlyHintsHeaders() {
        return this.#earlyHintsHeaders || [];
    }
    set earlyHintsHeaders(x) {
        this.#earlyHintsHeaders = x;
    }
    get originalResponseHeaders() {
        return this.#originalResponseHeaders;
    }
    set originalResponseHeaders(headers) {
        this.#originalResponseHeaders = headers;
        this.#sortedOriginalResponseHeaders = undefined;
    }
    get setCookieHeaders() {
        return this.#setCookieHeaders;
    }
    set setCookieHeaders(headers) {
        this.#setCookieHeaders = headers;
    }
    get responseHeadersText() {
        return this.#responseHeadersText;
    }
    set responseHeadersText(x) {
        this.#responseHeadersText = x;
        this.dispatchEventToListeners(Events.RESPONSE_HEADERS_CHANGED);
    }
    get sortedResponseHeaders() {
        if (this.#sortedResponseHeaders !== undefined) {
            return this.#sortedResponseHeaders;
        }
        this.#sortedResponseHeaders = this.responseHeaders.slice();
        return this.#sortedResponseHeaders.sort(function (a, b) {
            return Platform.StringUtilities.compare(a.name.toLowerCase(), b.name.toLowerCase());
        });
    }
    get sortedOriginalResponseHeaders() {
        if (this.#sortedOriginalResponseHeaders !== undefined) {
            return this.#sortedOriginalResponseHeaders;
        }
        this.#sortedOriginalResponseHeaders = this.originalResponseHeaders.slice();
        return this.#sortedOriginalResponseHeaders.sort(function (a, b) {
            return Platform.StringUtilities.compare(a.name.toLowerCase(), b.name.toLowerCase());
        });
    }
    get overrideTypes() {
        const types = [];
        if (this.hasOverriddenContent) {
            types.push('content');
        }
        if (this.hasOverriddenHeaders()) {
            types.push('headers');
        }
        return types;
    }
    get hasOverriddenContent() {
        return this.#hasOverriddenContent;
    }
    set hasOverriddenContent(value) {
        this.#hasOverriddenContent = value;
    }
    #deduplicateHeaders(sortedHeaders) {
        const dedupedHeaders = [];
        for (const header of sortedHeaders) {
            if (dedupedHeaders.length && dedupedHeaders[dedupedHeaders.length - 1].name === header.name) {
                dedupedHeaders[dedupedHeaders.length - 1].value += `, ${header.value}`;
            }
            else {
                dedupedHeaders.push({ name: header.name, value: header.value });
            }
        }
        return dedupedHeaders;
    }
    hasOverriddenHeaders() {
        if (!this.#originalResponseHeaders.length) {
            return false;
        }
        const responseHeaders = this.#deduplicateHeaders(this.sortedResponseHeaders);
        const originalResponseHeaders = this.#deduplicateHeaders(this.sortedOriginalResponseHeaders);
        if (responseHeaders.length !== originalResponseHeaders.length) {
            return true;
        }
        for (let i = 0; i < responseHeaders.length; i++) {
            if (responseHeaders[i].name.toLowerCase() !== originalResponseHeaders[i].name.toLowerCase()) {
                return true;
            }
            if (responseHeaders[i].value !== originalResponseHeaders[i].value) {
                return true;
            }
        }
        return false;
    }
    responseHeaderValue(headerName) {
        if (headerName in this.#responseHeaderValues) {
            return this.#responseHeaderValues[headerName];
        }
        this.#responseHeaderValues[headerName] = this.computeHeaderValue(this.responseHeaders, headerName);
        return this.#responseHeaderValues[headerName];
    }
    wasIntercepted() {
        return this.#wasIntercepted;
    }
    setWasIntercepted(wasIntercepted) {
        this.#wasIntercepted = wasIntercepted;
    }
    isImportedHar() {
        return this.#isImportedHar;
    }
    setEarlyHintsHeaders(headers) {
        this.earlyHintsHeaders = headers;
    }
    get responseCookies() {
        if (!this.#responseCookies) {
            this.#responseCookies = CookieParser.parseSetCookie(this.responseHeaderValue('Set-Cookie'), this.domain) ||
                [];
            if (this.#responseCookiesPartitionKey) {
                for (const cookie of this.#responseCookies) {
                    if (cookie.partitioned()) {
                        cookie.setPartitionKey(this.#responseCookiesPartitionKey.topLevelSite, this.#responseCookiesPartitionKey.hasCrossSiteAncestor);
                    }
                }
            }
            else if (this.#responseCookiesPartitionKeyOpaque) {
                for (const cookie of this.#responseCookies) {
                    // Do not check cookie.partitioned() since most opaque partitions
                    // are fenced/credentialless frames partitioned by default.
                    cookie.setPartitionKeyOpaque();
                }
            }
        }
        return this.#responseCookies;
    }
    set responseCookies(responseCookies) {
        this.#responseCookies = responseCookies;
    }
    responseLastModified() {
        return this.responseHeaderValue('last-modified');
    }
    allCookiesIncludingBlockedOnes() {
        return [
            ...this.includedRequestCookies().map(includedRequestCookie => includedRequestCookie.cookie),
            ...this.responseCookies,
            ...this.blockedRequestCookies().map(blockedRequestCookie => blockedRequestCookie.cookie),
            ...this.blockedResponseCookies().map(blockedResponseCookie => blockedResponseCookie.cookie),
        ].filter(v => !!v);
    }
    get serverTimings() {
        if (typeof this.#serverTimings === 'undefined') {
            this.#serverTimings = ServerTiming.parseHeaders(this.responseHeaders.map(x => ({ name: x.name, value: x.value })), this.#console);
        }
        return this.#serverTimings;
    }
    queryString() {
        if (this.#queryString !== undefined) {
            return this.#queryString;
        }
        let queryString = null;
        const url = this.url();
        const questionMarkPosition = url.indexOf('?');
        if (questionMarkPosition !== -1) {
            queryString = url.substring(questionMarkPosition + 1);
            const hashSignPosition = queryString.indexOf('#');
            if (hashSignPosition !== -1) {
                queryString = queryString.substring(0, hashSignPosition);
            }
        }
        this.#queryString = queryString;
        return this.#queryString;
    }
    get queryParameters() {
        if (this.#parsedQueryParameters) {
            return this.#parsedQueryParameters;
        }
        const queryString = this.queryString();
        if (!queryString) {
            return null;
        }
        this.#parsedQueryParameters = this.parseParameters(queryString);
        return this.#parsedQueryParameters;
    }
    async parseFormParameters() {
        const requestContentType = this.requestContentType();
        if (!requestContentType) {
            return null;
        }
        // Handling application/#x-www-form-urlencoded request bodies.
        if (requestContentType.match(/^application\/x-www-form-urlencoded\s*(;.*)?$/i)) {
            const formData = await this.requestFormData();
            if (!formData) {
                return null;
            }
            return this.parseParameters(formData);
        }
        // Handling multipart/form-data request bodies.
        const multipartDetails = requestContentType.match(/^multipart\/form-data\s*;\s*boundary\s*=\s*(\S+)\s*$/);
        if (!multipartDetails) {
            return null;
        }
        const boundary = multipartDetails[1];
        if (!boundary) {
            return null;
        }
        const formData = await this.requestFormData();
        if (!formData) {
            return null;
        }
        return this.parseMultipartFormDataParameters(formData, boundary);
    }
    formParameters() {
        if (!this.#formParametersPromise) {
            this.#formParametersPromise = this.parseFormParameters();
        }
        return this.#formParametersPromise;
    }
    responseHttpVersion() {
        const headersText = this.#responseHeadersText;
        if (!headersText) {
            const version = this.responseHeaderValue('version') || this.responseHeaderValue(':version');
            if (version) {
                return version;
            }
            return this.filteredProtocolName();
        }
        const firstLine = headersText.split(/\r\n/)[0];
        const match = firstLine.match(/^(HTTP\/\d+\.\d+)/);
        return match ? match[1] : 'HTTP/0.9';
    }
    parseParameters(queryString) {
        function parseNameValue(pair) {
            const position = pair.indexOf('=');
            if (position === -1) {
                return { name: pair, value: '' };
            }
            return {
                name: pair.substring(0, position),
                value: pair.substring(position + 1),
            };
        }
        return queryString.split('&').map(parseNameValue);
    }
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
    parseMultipartFormDataParameters(data, boundary) {
        const sanitizedBoundary = Platform.StringUtilities.escapeForRegExp(boundary);
        const keyValuePattern = new RegExp(
        // Header with an optional file #name.
        '^\\r\\ncontent-disposition\\s*:\\s*form-data\\s*;\\s*name="([^"]*)"(?:\\s*;\\s*filename="([^"]*)")?' +
            // Optional secondary header with the content type.
            '(?:\\r\\ncontent-type\\s*:\\s*([^\\r\\n]*))?' +
            // Padding.
            '\\r\\n\\r\\n' +
            // Value
            '(.*)' +
            // Padding.
            '\\r\\n$', 'is');
        const fields = data.split(new RegExp(`--${sanitizedBoundary}(?:--\s*$)?`, 'g'));
        return fields.reduce(parseMultipartField, []);
        function parseMultipartField(result, field) {
            const [match, name, filename, contentType, value] = field.match(keyValuePattern) || [];
            if (!match) {
                return result;
            }
            const processedValue = filename || contentType ? i18nString(UIStrings.binary) : value;
            result.push({ name, value: processedValue });
            return result;
        }
    }
    computeHeaderValue(headers, headerName) {
        headerName = headerName.toLowerCase();
        const values = [];
        for (let i = 0; i < headers.length; ++i) {
            if (headers[i].name.toLowerCase() === headerName) {
                values.push(headers[i].value);
            }
        }
        if (!values.length) {
            return undefined;
        }
        // Set-Cookie #values should be separated by '\n', not comma, otherwise cookies could not be parsed.
        if (headerName === 'set-cookie') {
            return values.join('\n');
        }
        return values.join(', ');
    }
    requestContentData() {
        if (this.#contentData) {
            return this.#contentData;
        }
        if (this.#contentDataProvider) {
            this.#contentData = this.#contentDataProvider();
        }
        else {
            this.#contentData = NetworkManager.requestContentData(this);
        }
        return this.#contentData;
    }
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
    requestContentDataIfAvailable() {
        // A content data provider returns the body without waiting for the request
        // to finish, so only requests without a content data provider can block.
        if (!this.finished && !this.#contentDataProvider) {
            return Promise.resolve({ error: 'Request has not finished loading' });
        }
        return this.requestContentData();
    }
    setContentDataProvider(dataProvider) {
        console.assert(!this.#contentData, 'contentData can only be set once.');
        this.#contentDataProvider = dataProvider;
    }
    requestStreamingContent() {
        if (this.#streamingContentData) {
            return this.#streamingContentData;
        }
        const contentPromise = this.finished ? this.requestContentData() : NetworkManager.streamResponseBody(this);
        this.#streamingContentData = contentPromise.then(contentData => {
            if (TextUtils.ContentData.ContentData.isError(contentData)) {
                return contentData;
            }
            // Note that this is save: "streamResponseBody()" always creates base64-based ContentData and
            // for "contentData()" we'll never call "addChunk".
            const streamingContentData = TextUtils.StreamingContentData.StreamingContentData.from(contentData);
            this.#resolvedStreamingContentData = streamingContentData;
            return streamingContentData;
        });
        return this.#streamingContentData;
    }
    contentURL() {
        return this.#url;
    }
    contentType() {
        return this.#resourceType;
    }
    async searchInContent(query, caseSensitive, isRegex) {
        if (!this.#contentDataProvider) {
            const cachedContentData = this.finished && !this.failed ?
                (await this.#contentData ?? this.#resolvedStreamingContentData?.content()) :
                undefined;
            if (cachedContentData && !TextUtils.ContentData.ContentData.isError(cachedContentData) &&
                cachedContentData.isTextContent) {
                return TextUtils.TextUtils.performSearchInContentData(cachedContentData, query, caseSensitive, isRegex);
            }
            return await NetworkManager.searchInRequest(this, query, caseSensitive, isRegex);
        }
        const contentData = await this.requestContentData();
        if (TextUtils.ContentData.ContentData.isError(contentData) || !contentData.isTextContent) {
            return [];
        }
        return TextUtils.TextUtils.performSearchInContentData(contentData, query, caseSensitive, isRegex);
    }
    requestContentType() {
        return this.requestHeaderValue('Content-Type');
    }
    requestContentEncoding() {
        return this.requestHeaderValue('Content-Encoding');
    }
    hasErrorStatusCode() {
        return this.statusCode >= 400;
    }
    setInitialPriority(priority) {
        this.#initialPriority = priority;
    }
    initialPriority() {
        return this.#initialPriority;
    }
    setPriority(priority) {
        this.#currentPriority = priority;
    }
    priority() {
        return this.#currentPriority || this.#initialPriority || null;
    }
    setSignedExchangeInfo(info) {
        this.#signedExchangeInfo = info;
    }
    signedExchangeInfo() {
        return this.#signedExchangeInfo;
    }
    async populateImageSource(image) {
        const contentData = await this.requestContentData();
        if (TextUtils.ContentData.ContentData.isError(contentData)) {
            return;
        }
        const imageSrc = contentData.asImagePreviewUrl();
        image.src = imageSrc ?? ''; // Empty the image if we cannot generate a preview URL
    }
    initiator() {
        return this.#initiator || null;
    }
    hasUserGesture() {
        return this.#hasUserGesture ?? null;
    }
    frames() {
        return this.#frames;
    }
    addProtocolFrameError(errorMessage, time) {
        this.addFrame({
            type: WebSocketFrameType.Error,
            text: errorMessage,
            time: this.pseudoWallTime(time),
            opCode: -1,
            mask: false,
        });
    }
    addProtocolFrame(response, time, sent) {
        const type = sent ? WebSocketFrameType.Send : WebSocketFrameType.Receive;
        this.addFrame({
            type,
            text: response.payloadData,
            time: this.pseudoWallTime(time),
            opCode: response.opcode,
            mask: response.mask,
        });
    }
    addFrame(frame) {
        this.#frames.push(frame);
        this.dispatchEventToListeners(Events.WEBSOCKET_FRAME_ADDED, frame);
    }
    directSocketChunks() {
        return this.#directSocketChunks;
    }
    addDirectSocketChunk(chunk) {
        this.#directSocketChunks.push(chunk);
        this.dispatchEventToListeners(Events.DIRECTSOCKET_CHUNK_ADDED, chunk);
    }
    eventSourceMessages() {
        return this.#serverSentEvents?.eventSourceMessages ?? [];
    }
    addEventSourceMessage(time, eventName, eventId, data) {
        this.#serverSentEvents?.onProtocolEventSourceMessageReceived(eventName, data, eventId, this.pseudoWallTime(time));
    }
    markAsRedirect(redirectCount) {
        this.#isRedirect = true;
        this.#requestId = `${this.#backendRequestId}:redirected.${redirectCount}`;
    }
    isRedirect() {
        return this.#isRedirect;
    }
    setRequestIdForTest(requestId) {
        this.#backendRequestId = requestId;
        this.#requestId = requestId;
    }
    charset() {
        return this.#charset ?? null;
    }
    setCharset(charset) {
        this.#charset = charset;
    }
    addExtraRequestInfo(extraRequestInfo) {
        this.#blockedRequestCookies = extraRequestInfo.blockedRequestCookies;
        this.setIncludedRequestCookies(extraRequestInfo.includedRequestCookies);
        this.setRequestHeaders(extraRequestInfo.requestHeaders);
        this.#hasExtraRequestInfo = true;
        this.setRequestHeadersText(''); // Mark request headers as non-provisional
        this.#deviceBoundSessionUsages = extraRequestInfo.deviceBoundSessionUsages || [];
        this.#clientSecurityState = extraRequestInfo.clientSecurityState;
        this.#appliedNetworkConditionsId = extraRequestInfo.appliedNetworkConditionsId;
        if (extraRequestInfo.connectTiming) {
            this.setConnectTimingFromExtraInfo(extraRequestInfo.connectTiming);
        }
        this.#siteHasCookieInOtherPartition = extraRequestInfo.siteHasCookieInOtherPartition ?? false;
        this.#hasThirdPartyCookiePhaseoutIssue = this.#blockedRequestCookies.some(item => item.blockedReasons.includes("ThirdPartyPhaseout" /* Protocol.Network.CookieBlockedReason.ThirdPartyPhaseout */));
    }
    setAppliedNetworkConditions(appliedNetworkConditionsId) {
        this.#appliedNetworkConditionsId = appliedNetworkConditionsId;
    }
    getDeviceBoundSessionUsages() {
        return this.#deviceBoundSessionUsages;
    }
    hasExtraRequestInfo() {
        return this.#hasExtraRequestInfo;
    }
    blockedRequestCookies() {
        return this.#blockedRequestCookies;
    }
    setIncludedRequestCookies(includedRequestCookies) {
        this.#includedRequestCookies = includedRequestCookies;
    }
    includedRequestCookies() {
        return this.#includedRequestCookies;
    }
    hasRequestCookies() {
        return (this.#includedRequestCookies.length > 0 || this.#blockedRequestCookies.length > 0);
    }
    siteHasCookieInOtherPartition() {
        return this.#siteHasCookieInOtherPartition;
    }
    // Parse the status text from the first line of the response headers text.
    // See net::HttpResponseHeaders::GetStatusText.
    static parseStatusTextFromResponseHeadersText(responseHeadersText) {
        const firstLineParts = responseHeadersText.split('\r')[0].split(' ');
        return firstLineParts.slice(2).join(' ');
    }
    addExtraResponseInfo(extraResponseInfo) {
        this.#blockedResponseCookies = extraResponseInfo.blockedResponseCookies;
        if (extraResponseInfo.exemptedResponseCookies) {
            this.#exemptedResponseCookies = extraResponseInfo.exemptedResponseCookies;
        }
        this.#responseCookiesPartitionKey =
            extraResponseInfo.cookiePartitionKey ? extraResponseInfo.cookiePartitionKey : null;
        this.#responseCookiesPartitionKeyOpaque = extraResponseInfo.cookiePartitionKeyOpaque || null;
        this.responseHeaders = extraResponseInfo.responseHeaders;
        // We store a copy of the headers we initially received, so that after
        // potential header overrides, we can compare actual with original headers.
        this.originalResponseHeaders = extraResponseInfo.responseHeaders.map(headerEntry => ({ ...headerEntry }));
        if (extraResponseInfo.responseHeadersText) {
            this.responseHeadersText = extraResponseInfo.responseHeadersText;
            if (!this.requestHeadersText()) {
                // Generate request headers text from raw headers in extra request info because
                // Network.requestWillBeSentExtraInfo doesn't include headers text.
                let requestHeadersText = `${this.requestMethod} ${this.parsedURL.path}`;
                if (this.parsedURL.queryParams) {
                    requestHeadersText += `?${this.parsedURL.queryParams}`;
                }
                requestHeadersText += ' HTTP/1.1\r\n';
                for (const { name, value } of this.requestHeaders()) {
                    requestHeadersText += `${name}: ${value}\r\n`;
                }
                this.setRequestHeadersText(requestHeadersText);
            }
            this.statusText = NetworkRequest.parseStatusTextFromResponseHeadersText(extraResponseInfo.responseHeadersText);
        }
        this.#remoteAddressSpace = extraResponseInfo.resourceIPAddressSpace;
        if (extraResponseInfo.statusCode) {
            this.statusCode = extraResponseInfo.statusCode;
        }
        this.#hasExtraResponseInfo = true;
        // TODO(crbug.com/1252463) Explore replacing this with a DevTools Issue.
        const networkManager = NetworkManager.forRequest(this);
        if (!networkManager) {
            return;
        }
        for (const blockedCookie of this.#blockedResponseCookies) {
            if (blockedCookie.blockedReasons.includes("NameValuePairExceedsMaxSize" /* Protocol.Network.SetCookieBlockedReason.NameValuePairExceedsMaxSize */)) {
                const message = i18nString(UIStrings.setcookieHeaderIsIgnoredIn, {
                    PH1: this.url(),
                });
                networkManager.dispatchEventToListeners(NetworkManagerEvents.MessageGenerated, { message, requestId: this.#requestId, warning: true });
            }
        }
        const cookieModel = networkManager.target().model(CookieModel);
        if (!cookieModel) {
            return;
        }
        for (const exemptedCookie of this.#exemptedResponseCookies) {
            cookieModel.removeBlockedCookie(exemptedCookie.cookie);
        }
        for (const blockedCookie of this.#blockedResponseCookies) {
            const cookie = blockedCookie.cookie;
            if (!cookie) {
                continue;
            }
            if (blockedCookie.blockedReasons.includes("ThirdPartyPhaseout" /* Protocol.Network.SetCookieBlockedReason.ThirdPartyPhaseout */)) {
                this.#hasThirdPartyCookiePhaseoutIssue = true;
            }
            cookieModel.addBlockedCookie(cookie, blockedCookie.blockedReasons.map(blockedReason => ({
                attribute: setCookieBlockedReasonToAttribute(blockedReason),
                uiString: setCookieBlockedReasonToUiString(blockedReason),
            })));
        }
    }
    hasExtraResponseInfo() {
        return this.#hasExtraResponseInfo;
    }
    blockedResponseCookies() {
        return this.#blockedResponseCookies;
    }
    exemptedResponseCookies() {
        return this.#exemptedResponseCookies;
    }
    nonBlockedResponseCookies() {
        const blockedCookieLines = this.blockedResponseCookies().map(blockedCookie => blockedCookie.cookieLine);
        // Use array and remove 1 by 1 to handle the (potential) case of multiple
        // identical cookies, only some of which are blocked.
        const responseCookies = this.responseCookies.filter(cookie => {
            const index = blockedCookieLines.indexOf(cookie.getCookieLine());
            if (index !== -1) {
                blockedCookieLines[index] = null;
                return false;
            }
            return true;
        });
        return responseCookies;
    }
    responseCookiesPartitionKey() {
        return this.#responseCookiesPartitionKey;
    }
    responseCookiesPartitionKeyOpaque() {
        return this.#responseCookiesPartitionKeyOpaque;
    }
    redirectSourceSignedExchangeInfoHasNoErrors() {
        return (this.#redirectSource !== null && this.#redirectSource.#signedExchangeInfo !== null &&
            !this.#redirectSource.#signedExchangeInfo.errors);
    }
    clientSecurityState() {
        return this.#clientSecurityState;
    }
    setTrustTokenParams(trustTokenParams) {
        this.#trustTokenParams = trustTokenParams;
    }
    trustTokenParams() {
        return this.#trustTokenParams;
    }
    setTrustTokenOperationDoneEvent(doneEvent) {
        this.#trustTokenOperationDoneEvent = doneEvent;
        this.dispatchEventToListeners(Events.TRUST_TOKEN_RESULT_ADDED);
    }
    trustTokenOperationDoneEvent() {
        return this.#trustTokenOperationDoneEvent;
    }
    setIsSameSite(isSameSite) {
        this.#isSameSite = isSameSite;
    }
    isSameSite() {
        return this.#isSameSite;
    }
    setIsAdRelated(isAdRelated) {
        this.#isAdRelated = isAdRelated;
    }
    isAdRelated() {
        return this.#isAdRelated;
    }
    setIsLinkPreload(isLinkPreload) {
        this.#isLinkPreload = isLinkPreload;
    }
    isLinkPreload() {
        return this.#isLinkPreload;
    }
    getAssociatedData(key) {
        return this.#associatedData.get(key) || null;
    }
    setAssociatedData(key, data) {
        this.#associatedData.set(key, data);
    }
    deleteAssociatedData(key) {
        this.#associatedData.delete(key);
    }
    hasThirdPartyCookiePhaseoutIssue() {
        return this.#hasThirdPartyCookiePhaseoutIssue;
    }
    addDataReceivedEvent({ timestamp, dataLength, encodedDataLength, data, }) {
        this.resourceSize += dataLength;
        if (encodedDataLength !== -1) {
            this.increaseTransferSize(encodedDataLength);
        }
        this.endTime = timestamp;
        if (data) {
            if (this.#resolvedStreamingContentData) {
                this.#resolvedStreamingContentData.addChunk(data);
            }
            else {
                void this.#streamingContentData?.then(contentData => {
                    if (!TextUtils.StreamingContentData.isError(contentData)) {
                        contentData.addChunk(data);
                    }
                });
            }
        }
    }
    waitForResponseReceived() {
        if (this.responseReceivedPromise) {
            return this.responseReceivedPromise;
        }
        const { promise, resolve } = Promise.withResolvers();
        this.responseReceivedPromise = promise;
        this.responseReceivedPromiseResolve = resolve;
        return this.responseReceivedPromise;
    }
}
export var Events;
(function (Events) {
    Events["FINISHED_LOADING"] = "FinishedLoading";
    Events["TIMING_CHANGED"] = "TimingChanged";
    Events["REMOTE_ADDRESS_CHANGED"] = "RemoteAddressChanged";
    Events["REQUEST_HEADERS_CHANGED"] = "RequestHeadersChanged";
    Events["RESPONSE_HEADERS_CHANGED"] = "ResponseHeadersChanged";
    Events["WEBSOCKET_FRAME_ADDED"] = "WebsocketFrameAdded";
    Events["DIRECTSOCKET_CHUNK_ADDED"] = "DirectsocketChunkAdded";
    Events["EVENT_SOURCE_MESSAGE_ADDED"] = "EventSourceMessageAdded";
    Events["TRUST_TOKEN_RESULT_ADDED"] = "TrustTokenResultAdded";
})(Events || (Events = {}));
export var InitiatorType;
(function (InitiatorType) {
    InitiatorType["OTHER"] = "other";
    InitiatorType["PARSER"] = "parser";
    InitiatorType["REDIRECT"] = "redirect";
    InitiatorType["SCRIPT"] = "script";
    InitiatorType["PRELOAD"] = "preload";
    InitiatorType["SIGNED_EXCHANGE"] = "signedExchange";
    InitiatorType["PREFLIGHT"] = "preflight";
})(InitiatorType || (InitiatorType = {}));
export var WebSocketFrameType;
(function (WebSocketFrameType) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    WebSocketFrameType["Send"] = "send";
    WebSocketFrameType["Receive"] = "receive";
    WebSocketFrameType["Error"] = "error";
    /* eslint-enable @typescript-eslint/naming-convention */
})(WebSocketFrameType || (WebSocketFrameType = {}));
export const cookieExemptionReasonToUiString = function (exemptionReason) {
    switch (exemptionReason) {
        case "UserSetting" /* Protocol.Network.CookieExemptionReason.UserSetting */:
            return i18nString(UIStrings.exemptionReasonUserSetting);
        case "EnterprisePolicy" /* Protocol.Network.CookieExemptionReason.EnterprisePolicy */:
            return i18nString(UIStrings.exemptionReasonEnterprisePolicy);
        case "StorageAccess" /* Protocol.Network.CookieExemptionReason.StorageAccess */:
            return i18nString(UIStrings.exemptionReasonStorageAccessAPI);
        case "TopLevelStorageAccess" /* Protocol.Network.CookieExemptionReason.TopLevelStorageAccess */:
            return i18nString(UIStrings.exemptionReasonTopLevelStorageAccessAPI);
        case "Scheme" /* Protocol.Network.CookieExemptionReason.Scheme */:
            return i18nString(UIStrings.exemptionReasonScheme);
    }
    return '';
};
export const cookieBlockedReasonToUiString = function (blockedReason) {
    switch (blockedReason) {
        case "SecureOnly" /* Protocol.Network.CookieBlockedReason.SecureOnly */:
            return i18nString(UIStrings.secureOnly);
        case "NotOnPath" /* Protocol.Network.CookieBlockedReason.NotOnPath */:
            return i18nString(UIStrings.notOnPath);
        case "DomainMismatch" /* Protocol.Network.CookieBlockedReason.DomainMismatch */:
            return i18nString(UIStrings.domainMismatch);
        case "SameSiteNoneInsecure" /* Protocol.Network.CookieBlockedReason.SameSiteNoneInsecure */:
            return i18nString(UIStrings.sameSiteNoneInsecure);
        case "UserPreferences" /* Protocol.Network.CookieBlockedReason.UserPreferences */:
            return i18nString(UIStrings.userPreferences);
        case "UnknownError" /* Protocol.Network.CookieBlockedReason.UnknownError */:
            return i18nString(UIStrings.unknownError);
        case "SchemefulSameSiteStrict" /* Protocol.Network.CookieBlockedReason.SchemefulSameSiteStrict */:
            return i18nString(UIStrings.sameSiteStrict);
        case "SchemefulSameSiteLax" /* Protocol.Network.CookieBlockedReason.SchemefulSameSiteLax */:
            return i18nString(UIStrings.sameSiteLax);
        case "SchemefulSameSiteUnspecifiedTreatedAsLax" /* Protocol.Network.CookieBlockedReason.SchemefulSameSiteUnspecifiedTreatedAsLax */:
            return i18nString(UIStrings.sameSiteUnspecifiedTreatedAsLax);
        case "NameValuePairExceedsMaxSize" /* Protocol.Network.CookieBlockedReason.NameValuePairExceedsMaxSize */:
            return i18nString(UIStrings.nameValuePairExceedsMaxSize);
        case "ThirdPartyPhaseout" /* Protocol.Network.CookieBlockedReason.ThirdPartyPhaseout */:
            return i18nString(UIStrings.thirdPartyPhaseout);
    }
    return '';
};
export const setCookieBlockedReasonToUiString = function (blockedReason) {
    switch (blockedReason) {
        case "SecureOnly" /* Protocol.Network.SetCookieBlockedReason.SecureOnly */:
            return i18nString(UIStrings.blockedReasonSecureOnly);
        case "SameSiteNoneInsecure" /* Protocol.Network.SetCookieBlockedReason.SameSiteNoneInsecure */:
            return i18nString(UIStrings.blockedReasonSameSiteNoneInsecure);
        case "UserPreferences" /* Protocol.Network.SetCookieBlockedReason.UserPreferences */:
            return i18nString(UIStrings.thisSetcookieWasBlockedDueToUser);
        case "SyntaxError" /* Protocol.Network.SetCookieBlockedReason.SyntaxError */:
            return i18nString(UIStrings.thisSetcookieHadInvalidSyntax);
        case "SchemeNotSupported" /* Protocol.Network.SetCookieBlockedReason.SchemeNotSupported */:
            return i18nString(UIStrings.theSchemeOfThisConnectionIsNot);
        case "OverwriteSecure" /* Protocol.Network.SetCookieBlockedReason.OverwriteSecure */:
            return i18nString(UIStrings.blockedReasonOverwriteSecure);
        case "InvalidDomain" /* Protocol.Network.SetCookieBlockedReason.InvalidDomain */:
            return i18nString(UIStrings.blockedReasonInvalidDomain);
        case "InvalidPrefix" /* Protocol.Network.SetCookieBlockedReason.InvalidPrefix */:
            return i18nString(UIStrings.blockedReasonInvalidPrefix);
        case "UnknownError" /* Protocol.Network.SetCookieBlockedReason.UnknownError */:
            return i18nString(UIStrings.anUnknownErrorWasEncounteredWhenTrying);
        case "SchemefulSameSiteStrict" /* Protocol.Network.SetCookieBlockedReason.SchemefulSameSiteStrict */:
            return i18nString(UIStrings.blockedReasonSameSiteStrictLax, {
                PH1: 'SameSite=Strict',
            });
        case "SchemefulSameSiteLax" /* Protocol.Network.SetCookieBlockedReason.SchemefulSameSiteLax */:
            return i18nString(UIStrings.blockedReasonSameSiteStrictLax, {
                PH1: 'SameSite=Lax',
            });
        case "SchemefulSameSiteUnspecifiedTreatedAsLax" /* Protocol.Network.SetCookieBlockedReason.SchemefulSameSiteUnspecifiedTreatedAsLax */:
            return i18nString(UIStrings.blockedReasonSameSiteUnspecifiedTreatedAsLax);
        case "NameValuePairExceedsMaxSize" /* Protocol.Network.SetCookieBlockedReason.NameValuePairExceedsMaxSize */:
            return i18nString(UIStrings.thisSetcookieWasBlockedBecauseTheNameValuePairExceedsMaxSize);
        case "DisallowedCharacter" /* Protocol.Network.SetCookieBlockedReason.DisallowedCharacter */:
            return i18nString(UIStrings.thisSetcookieHadADisallowedCharacter);
        case "ThirdPartyPhaseout" /* Protocol.Network.SetCookieBlockedReason.ThirdPartyPhaseout */:
            return i18nString(UIStrings.thisSetcookieWasBlockedDueThirdPartyPhaseout);
    }
    return '';
};
export const cookieBlockedReasonToAttribute = function (blockedReason) {
    switch (blockedReason) {
        case "SecureOnly" /* Protocol.Network.CookieBlockedReason.SecureOnly */:
            return "secure" /* Attribute.SECURE */;
        case "NotOnPath" /* Protocol.Network.CookieBlockedReason.NotOnPath */:
            return "path" /* Attribute.PATH */;
        case "DomainMismatch" /* Protocol.Network.CookieBlockedReason.DomainMismatch */:
            return "domain" /* Attribute.DOMAIN */;
        case "SameSiteNoneInsecure" /* Protocol.Network.CookieBlockedReason.SameSiteNoneInsecure */:
        case "SchemefulSameSiteStrict" /* Protocol.Network.CookieBlockedReason.SchemefulSameSiteStrict */:
        case "SchemefulSameSiteLax" /* Protocol.Network.CookieBlockedReason.SchemefulSameSiteLax */:
        case "SchemefulSameSiteUnspecifiedTreatedAsLax" /* Protocol.Network.CookieBlockedReason.SchemefulSameSiteUnspecifiedTreatedAsLax */:
            return "same-site" /* Attribute.SAME_SITE */;
        case "NameValuePairExceedsMaxSize" /* Protocol.Network.CookieBlockedReason.NameValuePairExceedsMaxSize */:
        case "UserPreferences" /* Protocol.Network.CookieBlockedReason.UserPreferences */:
        case "ThirdPartyPhaseout" /* Protocol.Network.CookieBlockedReason.ThirdPartyPhaseout */:
        case "UnknownError" /* Protocol.Network.CookieBlockedReason.UnknownError */:
            return null;
    }
    return null;
};
export const setCookieBlockedReasonToAttribute = function (blockedReason) {
    switch (blockedReason) {
        case "SecureOnly" /* Protocol.Network.SetCookieBlockedReason.SecureOnly */:
        case "OverwriteSecure" /* Protocol.Network.SetCookieBlockedReason.OverwriteSecure */:
            return "secure" /* Attribute.SECURE */;
        case "SameSiteNoneInsecure" /* Protocol.Network.SetCookieBlockedReason.SameSiteNoneInsecure */:
        case "SchemefulSameSiteStrict" /* Protocol.Network.SetCookieBlockedReason.SchemefulSameSiteStrict */:
        case "SchemefulSameSiteLax" /* Protocol.Network.SetCookieBlockedReason.SchemefulSameSiteLax */:
        case "SchemefulSameSiteUnspecifiedTreatedAsLax" /* Protocol.Network.SetCookieBlockedReason.SchemefulSameSiteUnspecifiedTreatedAsLax */:
            return "same-site" /* Attribute.SAME_SITE */;
        case "InvalidDomain" /* Protocol.Network.SetCookieBlockedReason.InvalidDomain */:
            return "domain" /* Attribute.DOMAIN */;
        case "InvalidPrefix" /* Protocol.Network.SetCookieBlockedReason.InvalidPrefix */:
            return "name" /* Attribute.NAME */;
        case "NameValuePairExceedsMaxSize" /* Protocol.Network.SetCookieBlockedReason.NameValuePairExceedsMaxSize */:
        case "UserPreferences" /* Protocol.Network.SetCookieBlockedReason.UserPreferences */:
        case "ThirdPartyPhaseout" /* Protocol.Network.SetCookieBlockedReason.ThirdPartyPhaseout */:
        case "SyntaxError" /* Protocol.Network.SetCookieBlockedReason.SyntaxError */:
        case "SchemeNotSupported" /* Protocol.Network.SetCookieBlockedReason.SchemeNotSupported */:
        case "UnknownError" /* Protocol.Network.SetCookieBlockedReason.UnknownError */:
        case "DisallowedCharacter" /* Protocol.Network.SetCookieBlockedReason.DisallowedCharacter */:
            return null;
    }
    return null;
};
export var DirectSocketType;
(function (DirectSocketType) {
    DirectSocketType[DirectSocketType["TCP"] = 1] = "TCP";
    DirectSocketType[DirectSocketType["UDP_BOUND"] = 2] = "UDP_BOUND";
    DirectSocketType[DirectSocketType["UDP_CONNECTED"] = 3] = "UDP_CONNECTED";
})(DirectSocketType || (DirectSocketType = {}));
export var DirectSocketStatus;
(function (DirectSocketStatus) {
    DirectSocketStatus[DirectSocketStatus["OPENING"] = 1] = "OPENING";
    DirectSocketStatus[DirectSocketStatus["OPEN"] = 2] = "OPEN";
    DirectSocketStatus[DirectSocketStatus["CLOSED"] = 3] = "CLOSED";
    DirectSocketStatus[DirectSocketStatus["ABORTED"] = 4] = "ABORTED";
})(DirectSocketStatus || (DirectSocketStatus = {}));
export var DirectSocketChunkType;
(function (DirectSocketChunkType) {
    DirectSocketChunkType["SEND"] = "send";
    DirectSocketChunkType["RECEIVE"] = "receive";
})(DirectSocketChunkType || (DirectSocketChunkType = {}));
//# sourceMappingURL=NetworkRequest.js.map