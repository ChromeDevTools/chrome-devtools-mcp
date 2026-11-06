export declare const UIStrings: {
    /**
     * @description This warning occurs when the website uses Attribution Reporting.
     */
    readonly AttributionReporting: "Attribution Reporting is deprecated and will be removed. See https://goo.gle/ps-status for details.";
    /**
     * @description We show this warning when 1) an 'authorization' header is attached to the request by scripts, 2) there is no 'authorization' in the 'access-control-allow-headers' header in the response, and 3) there is a wildcard symbol ('*') in the 'access-control-allow-header' header in the response. This is allowed now, but we're planning to reject such responses and require responses to have an 'access-control-allow-headers' containing 'authorization'.
     */
    readonly AuthorizationCoveredByWildcard: "Authorization will not be covered by the wildcard symbol (*) in CORS `Access-Control-Allow-Headers` handling.";
    /**
     * @description This warning occurs when a page attempts to request a resource whose URL contained both a newline character (`\n` or `\r`), and a less-than character (`<`). These resources are blocked.
     */
    readonly CanRequestURLHTTPContainingNewline: "Resource requests whose URLs contained both removed whitespace `\\(n|r|t)` characters and less-than characters (`<`) are blocked. Please remove newlines and encode less-than characters from places like element attribute values in order to load these resources.";
    /**
     * @description This warning occurs when the website attempts to invoke the deprecated `chrome.loadTimes().connectionInfo` API.
     */
    readonly ChromeLoadTimesConnectionInfo: "`chrome.loadTimes()` is deprecated, instead use standardized API: Navigation Timing 2.";
    /**
     * @description This warning occurs when the website attempts to invoke the deprecated `chrome.loadTimes().firstPaintAfterLoadTime` API.
     */
    readonly ChromeLoadTimesFirstPaintAfterLoadTime: "`chrome.loadTimes()` is deprecated, instead use standardized API: Paint Timing.";
    /**
     * @description This warning occurs when the website attempts to invoke the deprecated `chrome.loadTimes().wasAlternateProtocolAvailable` API.
     */
    readonly ChromeLoadTimesWasAlternateProtocolAvailable: "`chrome.loadTimes()` is deprecated, instead use standardized API: `nextHopProtocol` in Navigation Timing 2.";
    /**
     * @description This warning occurs when a frame accesses another frame's data after having set `document.domain` without having set the `Origin-Agent-Cluster` http header. This is a companion warning to `documentDomainSettingWithoutOriginAgentClusterHeader`, where that warning occurs when `document.domain` is set, and this warning occurs when an access has been made, based on that previous `document.domain` setting.
     */
    readonly CrossOriginAccessBasedOnDocumentDomain: "Relaxing the same-origin policy by setting `document.domain` is deprecated, and will be disabled by default. This deprecation warning is for a cross-origin access that was enabled by setting `document.domain`.";
    /**
     * @description Issue text shown when the web page uses a deprecated web API. The window.alert is the deprecated web API function.
     */
    readonly CrossOriginWindowAlert: "Triggering window.alert from cross origin iframes has been deprecated and will be removed in the future.";
    /**
     * @description Issue text shown when the web page uses a deprecated web API. The window.confirm is the deprecated web API function.
     */
    readonly CrossOriginWindowConfirm: "Triggering window.confirm from cross origin iframes has been deprecated and will be removed in the future.";
    /**
     * @description Warning displayed to developers when they hide the Cast button on a video element using the deprecated CSS selector instead of using the disableRemotePlayback attribute on the element.
     */
    readonly CSSSelectorInternalMediaControlsOverlayCastButton: "The `disableRemotePlayback` attribute should be used in order to disable the default Cast integration instead of using `-internal-media-controls-overlay-cast-button` selector.";
    /**
     * @description Warning displayed to developers to let them know the CSS appearance property value they used is not standard and will be removed.
     */
    readonly CSSValueAppearanceSliderVertical: "CSS appearance value `slider-vertical` is not standardized and will be removed.";
    /**
     * @description Warning displayed to developers when a data: URL is assigned to SVGUseElement to let them know that the support is deprecated.
     */
    readonly DataUrlInSvgUse: "Support for data: URLs in SVGUseElement is deprecated and it will be removed in the future.";
    /**
     * @description Warning displayed to developers when an unknown protocol string is used in a call to navigator.credentials.get() or create() with the 'digital' option.
     */
    readonly DigitalCredentialsUnknownProtocol: "An unknown Digital Credentials protocol was requested in navigator.credentials.get() or create(). In a future release, unrecognized protocols will be blocked.";
    /**
     * @description Warning displayed to developers when document.createEvent() is called with 'KeyboardEvents', which is a non-standard event interface that will be removed.
     */
    readonly DocumentCreateEventKeyboardEvents: "document.createEvent('KeyboardEvents') is deprecated and will be removed. Use `new KeyboardEvent()` instead.";
    /**
     * @description Warning displayed to developers when document.createEvent() is called with 'TransitionEvent', which is a non-standard event interface that will be removed.
     */
    readonly DocumentCreateEventTransitionEvent: "document.createEvent('TransitionEvent') is deprecated and will be removed. Use `new TransitionEvent()` instead.";
    /**
     * @description Translation is not needed, this will never be exposed in production code.
     */
    readonly ExampleBrowserProcessDeprecation: "This is an example for showing the code required for a browser process reported deprecation.";
    /**
     * @description Warning displayed to developers that they are using the Fenced Frame API which has been deprecated and is scheduled to be removed.
     */
    readonly FencedFrame: "Fenced Frame API is deprecated and scheduled for removal.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown when one of the Protected Audience APIs like `navigator.joinAdInterestGroup`, `navigator.getInterestGroupAdAuctionData` or `navigator.runAdAuction` are called.
     */
    readonly Fledge: "The Protected Audience API is deprecated and will be removed in a future release.";
    /**
     * @description Warning displayed to developers when the Geolocation API is used from an insecure origin (one that isn't localhost or doesn't use HTTPS) to notify them that this use is no longer supported.
     */
    readonly GeolocationInsecureOrigin: "`getCurrentPosition()` and `watchPosition()` no longer work on insecure origins. To use this feature, you should consider switching your application to a secure origin, such as HTTPS. See https://www.chromium.org/Home/chromium-security/deprecating-powerful-features-on-insecure-origins/ for more details.";
    /**
     * @description Warning displayed to developers when the Geolocation API is used from an insecure origin (one that isn't localhost or doesn't use HTTPS) to notify them that this use is deprecated.
     */
    readonly GeolocationInsecureOriginDeprecatedNotRemoved: "`getCurrentPosition()` and `watchPosition()` are deprecated on insecure origins. To use this feature, you should consider switching your application to a secure origin, such as HTTPS. See https://www.chromium.org/Home/chromium-security/deprecating-powerful-features-on-insecure-origins/ for more details.";
    /**
     * @description This warning occurs when the `getUserMedia()` API is invoked on an insecure (e.g., HTTP) site. This is only permitted on secure sites (e.g., HTTPS).
     */
    readonly GetUserMediaInsecureOrigin: "`getUserMedia()` no longer works on insecure origins. To use this feature, you should consider switching your application to a secure origin, such as HTTPS. See https://www.chromium.org/Home/chromium-security/deprecating-powerful-features-on-insecure-origins/ for more details.";
    /**
     * @description A deprecation warning shown to developers in the DevTools Issues tab when code tries to use the deprecated hostCandidate field, guiding developers to use the equivalent information in the .address and .port fields instead.
     */
    readonly HostCandidateAttributeGetter: "`RTCPeerConnectionIceErrorEvent.hostCandidate` is deprecated. Please use `RTCPeerConnectionIceErrorEvent.address` or `RTCPeerConnectionIceErrorEvent.port` instead.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab, when a service worker reads one of the fields from an event named 'canmakepayment'.
     */
    readonly IdentityInCanMakePaymentEvent: "The merchant origin and arbitrary data from the `canmakepayment` service worker event are deprecated and will be removed: `topOrigin`, `paymentRequestOrigin`, `methodData`, `modifiers`.";
    /**
     * @description This warning occurs when an insecure context (e.g., HTTP) requests a private resource (not on open internet). This is done to mitigate the potential for CSRF and other attacks.
     */
    readonly InsecurePrivateNetworkSubresourceRequest: "The website requested a subresource from a network that it could only access because of its users' privileged network position. These requests expose non-public devices and servers to the internet, increasing the risk of a cross-site request forgery (CSRF) attack, and/or information leakage. To mitigate these risks, Chrome deprecates requests to non-public subresources when initiated from non-secure contexts, and will start blocking them.";
    /**
     * @description This is a deprecated warning to developers that a field in a structure has been renamed.
     */
    readonly InterestGroupDailyUpdateUrl: "The `dailyUpdateUrl` field of `InterestGroups` passed to `joinAdInterestGroup()` has been renamed to `updateUrl`, to more accurately reflect its behavior.";
    /**
     * @description Warning displayed to developers that instead of calling the `Intl.v8BreakIterator` constructor, which is not a standard JavaScript API, use ECMA402 standard API Intl.Segmenter shipped in end of 2020 instead.
     */
    readonly IntlV8BreakIterator: "`Intl.v8BreakIterator` is deprecated. Please use `Intl.Segmenter` instead.";
    /**
     * @description Warning for using deprecated 'inputQuota' attribute.
     */
    readonly LanguageModel_InputQuota: "LanguageModel.inputQuota is deprecated. Please use LanguageModel.contextWindow instead. This alias is only available in extensions.";
    /**
     * @description Warning for using deprecated 'inputUsage' attribute.
     */
    readonly LanguageModel_InputUsage: "LanguageModel.inputUsage is deprecated. Please use LanguageModel.contextUsage instead. This alias is only available in extensions.";
    /**
     * @description Warning for using deprecated 'measureInputUsage' method.
     */
    readonly LanguageModel_MeasureInputUsage: "LanguageModel.measureInputUsage() is deprecated. Please use LanguageModel.measureContextUsage() instead. This alias is only available in extensions.";
    /**
     * @description Warning for using deprecated 'onquotaoverflow' event handler.
     */
    readonly LanguageModel_OnQuotaOverflow: "LanguageModel.onquotaoverflow is deprecated. Please use LanguageModel.oncontextoverflow instead. The LanguageModel.onquotaoverflow alias is only available in extensions.";
    /**
     * @description Warning message for web developers when they call the deprecated LanguageModel.params() method.
     */
    readonly LanguageModelParams: "LanguageModel.params() is deprecated and now only available in extension contexts. The topK and temperature related fields within its result are also deprecated.";
    /**
     * @description Warning message for web developers when they use the deprecated 'temperature' option in LanguageModel.create() or access the .temperature attribute.
     */
    readonly LanguageModelTemperature: "The 'temperature' parameter/attribute for LanguageModel is deprecated. It is only functional within extensions and may be removed in the future.";
    /**
     * @description Warning message for web developers when they use the deprecated 'topK' option in LanguageModel.create() or access the .topK attribute.
     */
    readonly LanguageModelTopK: "The 'topK' parameter/attribute for LanguageModel is deprecated. It is only functional within extensions and may be removed in the future.";
    /**
     * @description This warning occurs when a stylesheet loaded from a local file directive does not end in the file type `.css`.
     */
    readonly LocalCSSFileExtensionRejected: "CSS cannot be loaded from `file:` URLs unless they end in a `.css` file extension.";
    /**
     * @description This warning occurs when the browser requests Web MIDI access as sysex (system exclusive messages) can be allowed via prompt even if the browser did not specifically request it.
     */
    readonly NoSysexWebMIDIWithoutPermission: "Web MIDI will ask a permission to use even if the sysex is not specified in the `MIDIOptions`.";
    /**
     * @description Warning displayed to developers when the Notification API is used from an insecure origin (one that isn't localhost or doesn't use HTTPS) to notify them that this use is no longer supported.
     */
    readonly NotificationInsecureOrigin: "The Notification API may no longer be used from insecure origins. You should consider switching your application to a secure origin, such as HTTPS. See https://www.chromium.org/Home/chromium-security/deprecating-powerful-features-on-insecure-origins/ for more details.";
    /**
     * @description Warning displayed to developers when permission to use notifications has been requested by a cross-origin iframe, to notify them that this use is no longer supported.
     */
    readonly NotificationPermissionRequestedIframe: "Permission for the Notification API may no longer be requested from a cross-origin iframe. You should consider requesting permission from a top-level frame or opening a new window instead.";
    /**
     * @description Warning displayed to developers when CreateImageBitmap is used with the newly deprecated option imageOrientation: 'none'.
     */
    readonly ObsoleteCreateImageBitmapImageOrientationNone: "Option `imageOrientation: 'none'` in createImageBitmap is deprecated. Please use createImageBitmap with option '{imageOrientation: 'from-image'}' instead.";
    /**
     * @description This warning occurs when the WebRTC protocol attempts to negotiate a connection using an obsolete cipher and risks connection security.
     */
    readonly ObsoleteWebRtcCipherSuite: "Your partner is negotiating an obsolete (D)TLS version. Please check with your partner to have this fixed.";
    /**
     * @description Warning displayed to developers that use overflow:visible for replaced elements. This declaration was earlier ignored but will now change the element's painting based on whether the overflow value allows the element to paint outside its bounds.
     */
    readonly OverflowVisibleOnReplacedElement: "Specifying `overflow: visible` on img, video and canvas tags may cause them to produce visual content outside of the element bounds. See https://github.com/WICG/shared-element-transitions/blob/main/debugging_overflow_on_images.md.";
    /**
     * @description Warning displayed to developers when they use a Flash Embed URLS to let them know that the browser will not automatically link to their equivalent HTML5 link.
     */
    readonly OverrideFlashEmbedwithHTML: "Legacy flash video embed has been rewritten to HTML iframe. Flash is long gone, this rewriting hack is deprecated and may be removed in the future.";
    /**
     * @description Warning displayed to developers when they use the PaymentInstruments API to let them know this API is deprecated.
     */
    readonly PaymentInstruments: "`paymentManager.instruments` is deprecated. Please use just-in-time install for payment handlers instead.";
    /**
     * @description Warning displayed to developers when their Web Payment API usage violates their Content-Security-Policy (CSP) connect-src directive to let them know this CSP bypass has been deprecated.
     */
    readonly PaymentRequestCSPViolation: "Your `PaymentRequest` call bypassed Content-Security-Policy (CSP) `connect-src` directive. This bypass is deprecated. Please add the payment method identifier from the `PaymentRequest` API (in `supportedMethods` field) to your CSP `connect-src` directive.";
    /**
     * @description Warning displayed to developers when persistent storage type is used to notify that storage type is deprecated.
     */
    readonly PersistentQuotaType: "`StorageType.persistent` is deprecated. Please use standardized `navigator.storage` instead.";
    /**
     * @description This issue indicates that a `<source>` element with a `<picture>` parent was using an `src` attribute, which is not valid and is ignored by the browser. The `srcset` attribute should be used instead.
     */
    readonly PictureSourceSrc: "`<source src>` with a `<picture>` parent is invalid and therefore ignored. Please use `<source srcset>` instead.";
    /**
     * @description Warning displayed to developers when the vendor-prefixed method (webkitCancelAnimationFrame) is used rather than the equivalent unprefixed method (cancelAnimationFrame).
     */
    readonly PrefixedCancelAnimationFrame: "webkitCancelAnimationFrame is vendor-specific. Please use the standard cancelAnimationFrame instead.";
    /**
     * @description Warning displayed to developers when the vendor-prefixed method (webkitRequestAnimationFrame) is used rather than the equivalent unprefixed method (requestAnimationFrame).
     */
    readonly PrefixedRequestAnimationFrame: "webkitRequestAnimationFrame is vendor-specific. Please use the standard requestAnimationFrame instead.";
    /**
     * @description Standard message when one web API is deprecated in favor of another.
     */
    readonly PrefixedVideoDisplayingFullscreen: "HTMLVideoElement.webkitDisplayingFullscreen is deprecated. Please use Document.fullscreenElement instead.";
    /**
     * @description Standard message when one web API is deprecated in favor of another.
     */
    readonly PrefixedVideoEnterFullScreen: "HTMLVideoElement.webkitEnterFullScreen() is deprecated. Please use Element.requestFullscreen() instead.";
    /**
     * @description Standard message when one web API is deprecated in favor of another.
     */
    readonly PrefixedVideoEnterFullscreen: "HTMLVideoElement.webkitEnterFullscreen() is deprecated. Please use Element.requestFullscreen() instead.";
    /**
     * @description Standard message when one web API is deprecated in favor of another.
     */
    readonly PrefixedVideoExitFullScreen: "HTMLVideoElement.webkitExitFullScreen() is deprecated. Please use Document.exitFullscreen() instead.";
    /**
     * @description Standard message when one web API is deprecated in favor of another.
     */
    readonly PrefixedVideoExitFullscreen: "HTMLVideoElement.webkitExitFullscreen() is deprecated. Please use Document.exitFullscreen() instead.";
    /**
     * @description Standard message when one web API is deprecated in favor of another.
     */
    readonly PrefixedVideoSupportsFullscreen: "HTMLVideoElement.webkitSupportsFullscreen is deprecated. Please use Document.fullscreenEnabled instead.";
    /**
     * @description Warning displayed to developers when an SVG filter is applied to a disallowed content type.
     */
    readonly PreventSvgFilterPaint: "SVG filters cannot be applied to cross-origin iframes, restricted iframes (e.g., sandboxed), or plugins.";
    /**
     * @description Standard message when one web API is deprecated in favor of another.
     */
    readonly RangeExpand: "Range.expand() is deprecated. Please use Selection.modify() instead.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown when the Storage Access API is automatically granted by Related Website Sets. The placeholder will always be the string `Related Website Sets`.
     */
    readonly RelatedWebsiteSets: "`Related Website Sets` is deprecated and will be removed. See https://privacysandbox.com/news/update-on-plans-for-privacy-sandbox-technologies/ for more details.";
    /**
     * @description This warning occurs when a subresource loaded by a page has a URL with an authority portion. These are disallowed.
     */
    readonly RequestedSubresourceWithEmbeddedCredentials: "Subresource requests whose URLs contain embedded credentials (e.g. `https://user:pass@host/`) are blocked.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown when a video conferencing website attempts to use a non-standard crypto method when performing a handshake to set up a connection with another endpoint.
     */
    readonly RTCConstraintEnableDtlsSrtpFalse: "The constraint `DtlsSrtpKeyAgreement` is removed. You have specified a `false` value for this constraint, which is interpreted as an attempt to use the removed `SDES key negotiation` method. This functionality is removed; use a service that supports `DTLS key negotiation` instead.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown when a video conferencing website uses a non-standard API for controlling the crypto method used, but is not having an effect because the desired behavior is already enabled-by-default.
     */
    readonly RTCConstraintEnableDtlsSrtpTrue: "The constraint `DtlsSrtpKeyAgreement` is removed. You have specified a `true` value for this constraint, which had no effect, but you can remove this constraint for tidiness.";
    /**
     * @description Warning displayed to developers when the non-standard RTCPeerConnection.createDTMFSender() method is used. Developers should use the standard RTCRtpSender.dtmf attribute instead.
     */
    readonly RTCPeerConnectionCreateDTMFSender: "RTCPeerConnection.createDTMFSender() is deprecated and will be removed. Please use RTCRtpSender.dtmf instead.";
    /**
     * @description WebRTC is set of JavaScript APIs for sending and receiving data, audio and video. getStats() is a method used to obtain network and quality metrics. There are two versions of this method, one is being deprecated because it is non-standard.
     */
    readonly RTCPeerConnectionGetStatsLegacyNonCompliant: "The callback-based getStats() is deprecated and will be removed. Use the spec-compliant getStats() instead.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown then a video conferencing website attempts to use the `RTCP MUX` policy.
     */
    readonly RtcpMuxPolicyNegotiate: "The `rtcpMuxPolicy` option is deprecated and will be removed.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. The placeholder is always the noun 'SharedArrayBuffer' which refers to a JavaScript construct.
     */
    readonly SharedArrayBufferConstructedWithoutIsolation: "`SharedArrayBuffer` will require cross-origin isolation. See https://developer.chrome.com/blog/enabling-shared-array-buffer/ for more details.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown when the speech synthesis API is called before the page receives a user activation.
     */
    readonly TextToSpeech_DisallowedByAutoplay: "`speechSynthesis.speak()` without user activation is deprecated and will be removed.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown when one of the Topics APIs like `document.browsingTopics()`, `<img browsingtopics>`, `<iframe browsingtopics>`, or `fetch(url, {browsingTopics: true})` are used.
     */
    readonly Topics: "The Topics API is deprecated and will be removed in a future release.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. It's shown when a listener for the `unload` event is added.
     */
    readonly UnloadHandler: "Unload event listeners are deprecated and will be removed.";
    /**
     * @description A deprecation warning shown in the DevTools Issues tab. The placeholder is always the noun 'SharedArrayBuffer' which refers to a JavaScript construct. 'Extensions' refers to Chrome extensions. The warning is shown when Chrome Extensions attempt to use 'SharedArrayBuffer's under insecure circumstances.
     */
    readonly V8SharedArrayBufferConstructedInExtensionWithoutIsolation: "Extensions should opt into cross-origin isolation to continue using `SharedArrayBuffer`. See https://developer.chrome.com/docs/extensions/mv3/cross-origin-isolation/.";
    /**
     * @description Warning displayed to developers when an SVG filter is applied to view transition content, which is disallowed because the content may contain cross-origin iframes or plugins. `::view-transition-old()` and `::view-transition-new()` are CSS pseudo-element names and should not be translated.
     */
    readonly ViewTransitionPreventSvgFilterPaint: "SVG filters cannot be applied to view transition content, such as `::view-transition-old()` and `::view-transition-new()`, as it may contain cross-origin iframes or plugins.";
    /**
     * @description This warning occurs when the deprecated `BluetoothRemoteGATTCharacteristic.writeValue()` method is used. Developers should use `writeValueWithResponse()` or `writeValueWithoutResponse()` instead.
     */
    readonly WebBluetoothRemoteCharacteristicWriteValue: "`BluetoothRemoteGATTCharacteristic.writeValue()` is deprecated. Use `writeValueWithResponse()` or `writeValueWithoutResponse()` instead.";
    /**
     * @description Warning for using the deprecated 'incomingHighWaterMark' attribute on WebTransportDatagramDuplexStream. Developers should use 'incomingMaxBufferedDatagrams' instead.
     */
    readonly WebTransportDatagramDuplexStreamIncomingHighWaterMark: "WebTransportDatagramDuplexStream.incomingHighWaterMark has been renamed to incomingMaxBufferedDatagrams. incomingHighWaterMark will be removed in a future version of Chrome.";
    /**
     * @description Warning for using the deprecated 'outgoingHighWaterMark' attribute on WebTransportDatagramDuplexStream. Developers should use 'outgoingMaxBufferedDatagrams' instead.
     */
    readonly WebTransportDatagramDuplexStreamOutgoingHighWaterMark: "WebTransportDatagramDuplexStream.outgoingHighWaterMark has been renamed to outgoingMaxBufferedDatagrams. outgoingHighWaterMark will be removed in a future version of Chrome.";
    /**
     * @description Warning displayed to developers that they are using `XMLHttpRequest` API in a way that they expect an unsupported character encoding `UTF-16` could be used in the server reply.
     */
    readonly XHRJSONEncodingDetection: "UTF-16 is not supported by response json in `XMLHttpRequest`";
    /**
     * @description Warning displayed to developers. It is shown when the `XMLHttpRequest` API is used in a way that it slows down the page load of the next page. The `main thread` refers to an operating systems thread used to run most of the processing of HTML documents, so please use a consistent wording.
     */
    readonly XMLHttpRequestSynchronousInNonWorkerOutsideBeforeUnload: "Synchronous `XMLHttpRequest` on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.";
    /**
     * @description Warning displayed to developers that they are using either the XSLTProcessor API, or XSLT processing instructions, both of which have been deprecated and are scheduled to be removed.
     */
    readonly XSLT: "XSLTProcessor and XSLT Processing Instructions have been deprecated by all browsers. These features will be removed from this browser soon.";
};
export interface DeprecationDescriptor {
    milestone?: number;
    chromeStatusFeature?: number;
}
export declare const DEPRECATIONS_METADATA: Partial<Record<string, DeprecationDescriptor>>;
