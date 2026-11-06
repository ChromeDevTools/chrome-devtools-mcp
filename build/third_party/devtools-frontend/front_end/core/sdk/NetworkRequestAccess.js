// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SecurityOrigin from './SecurityOrigin.js';
/**
 * Specifies how a network request's response data (body and headers) can be accessed
 * relative to the initiating context's security origin.
 *
 * DevTools features that inspect network requests (such as AI Assistance) must respect
 * the browser Same-Origin Policy (SOP) and Cross-Origin Resource Sharing (CORS) rules:
 * - Same-origin responses are fully readable by the initiating document.
 * - Cross-origin responses with valid CORS headers (`Access-Control-Allow-Origin`) are readable.
 * - Opaque cross-origin responses (such as `no-cors` fetches to third-party endpoints) are NOT
 *   readable by the page and must never have their response bodies or restricted headers exposed
 *   to unauthorized contexts (b/513821237).
 */
export var ResponseAccessMode;
(function (ResponseAccessMode) {
    /** The request target URL is same-origin with the initiator context. */
    ResponseAccessMode["SAME_ORIGIN"] = "SAME_ORIGIN";
    /** The request is cross-origin, but explicit CORS response headers permit access by the initiator. */
    ResponseAccessMode["CORS_ALLOWED"] = "CORS_ALLOWED";
    /** The request is cross-origin without CORS authorization; response body and unexposed headers are restricted. */
    ResponseAccessMode["OPAQUE_CROSS_ORIGIN"] = "OPAQUE_CROSS_ORIGIN";
})(ResponseAccessMode || (ResponseAccessMode = {}));
/**
 * Standard CORS-safelisted response headers that are exposed on cross-origin requests
 * without requiring explicit `Access-Control-Expose-Headers`.
 *
 * @see https://fetch.spec.whatwg.org/#cors-safelisted-response-header-name
 */
export const CORS_SAFELISTED_RESPONSE_HEADERS = new Set([
    'cache-control',
    'content-language',
    'content-length',
    'content-type',
    'expires',
    'last-modified',
    'pragma',
]);
/**
 * Placeholder text replacing response body content when cross-origin access is forbidden.
 */
export const REDACTED_RESPONSE_BODY = '<redacted cross-origin response body>';
/**
 * Returns whether a network request was made with credentials (cookies or authorization headers)
 * or received `Set-Cookie` in the response.
 *
 * NOTE: The response header `Access-Control-Allow-Credentials: true` is sent by the server
 * to grant permission for credentialed CORS; it is not a credential sent by the client.
 *
 * Example:
 * If a page makes an uncredentialed request:
 *   `fetch('https://api.example.com/data', {credentials: 'omit'})`
 * And the server responds with:
 *   `Access-Control-Allow-Origin: *`
 *   `Access-Control-Allow-Credentials: true`
 * The browser allows the page to read the response under `*` because the client sent no cookies or auth.
 * If we treated `Access-Control-Allow-Credentials: true` as a credential here, we would falsely mark
 * this request as credentialed and reject the wildcard `*`.
 *
 * @param request The network request to inspect.
 * @returns True if the request or response carried authentication credentials or cookies.
 * @see https://fetch.spec.whatwg.org/#credentials
 */
export function isRequestCredentialed(request) {
    const hasAuthHeaders = Boolean(request.requestHeaderValue('authorization') || request.requestHeaderValue('proxy-authorization'));
    const hasCookies = request.includedRequestCookies().length > 0 || request.responseCookies.length > 0 ||
        Boolean(request.requestHeaderValue('cookie')) || Boolean(request.responseHeaderValue('set-cookie'));
    return hasAuthHeaders || hasCookies;
}
/**
 * Evaluates the response access mode for a network request relative to an initiator origin.
 *
 * Evaluation rules:
 * 1. If the initiator security origin is opaque (e.g. sandboxed iframe or `data:` URL), returns `OPAQUE_CROSS_ORIGIN`.
 * 2. If the initiator security origin is same-origin with the request URL, returns `SAME_ORIGIN`.
 * 3. If Chrome's network stack flagged a CORS error (`corsErrorStatus`), returns `OPAQUE_CROSS_ORIGIN`.
 * 4. If the server provided an `Access-Control-Allow-Origin` header:
 *    - Wildcard `*` grants `CORS_ALLOWED` only if the request does not include credentials. Under the
 *      Fetch specification, wildcard `*` is invalid for credentialed requests.
 *    - An explicit match against the initiator origin grants `CORS_ALLOWED` if uncredentialed, or if
 *      `Access-Control-Allow-Credentials: true` is also present for credentialed requests.
 * 5. Otherwise, returns `OPAQUE_CROSS_ORIGIN`.
 *
 * @param request The network request being inspected.
 * @param initiatorSecurityOrigin The security origin of the initiating context (e.g. page or conversation origin).
 * @returns The evaluated `ResponseAccessMode`.
 */
export function evaluateResponseAccessMode(request, initiatorSecurityOrigin) {
    // Opaque initiator contexts (e.g. data: URLs, sandboxed iframes) are never permitted
    // to inspect cross-origin response content.
    if (initiatorSecurityOrigin.isOpaque()) {
        return "OPAQUE_CROSS_ORIGIN" /* ResponseAccessMode.OPAQUE_CROSS_ORIGIN */;
    }
    const resourceOrigin = request.requestURLSecurityOrigin();
    if (initiatorSecurityOrigin.isSameOriginWith(resourceOrigin)) {
        return "SAME_ORIGIN" /* ResponseAccessMode.SAME_ORIGIN */;
    }
    // If the browser blocked the request with a CORS error, treat the response
    // as opaque regardless of any Access-Control-Allow-Origin header value.
    if (request.corsErrorStatus()) {
        return "OPAQUE_CROSS_ORIGIN" /* ResponseAccessMode.OPAQUE_CROSS_ORIGIN */;
    }
    const allowOriginHeader = request.responseHeaderValue('access-control-allow-origin')?.trim();
    if (!allowOriginHeader) {
        return "OPAQUE_CROSS_ORIGIN" /* ResponseAccessMode.OPAQUE_CROSS_ORIGIN */;
    }
    const isCredentialed = isRequestCredentialed(request);
    // Under the Fetch specification, wildcard '*' is forbidden from exposing responses if credentials are used.
    if (allowOriginHeader === '*' && !isCredentialed) {
        return "CORS_ALLOWED" /* ResponseAccessMode.CORS_ALLOWED */;
    }
    const allowedOrigin = SecurityOrigin.SecurityOrigin.create(allowOriginHeader);
    if (initiatorSecurityOrigin.isSameOriginWith(allowedOrigin)) {
        // Under the WHATWG Fetch specification (§ 3.2.5), when a request includes
        // credentials (cookies or authorization headers), the response is only exposed
        // if the server explicitly includes Access-Control-Allow-Credentials: true.
        if (isCredentialed) {
            const allowCredentials = request.responseHeaderValue('access-control-allow-credentials')?.trim().toLowerCase() === 'true';
            if (!allowCredentials) {
                return "OPAQUE_CROSS_ORIGIN" /* ResponseAccessMode.OPAQUE_CROSS_ORIGIN */;
            }
        }
        return "CORS_ALLOWED" /* ResponseAccessMode.CORS_ALLOWED */;
    }
    return "OPAQUE_CROSS_ORIGIN" /* ResponseAccessMode.OPAQUE_CROSS_ORIGIN */;
}
/**
 * Filters the response headers of a network request based on its access mode.
 *
 * - `SAME_ORIGIN`: Returns all response headers.
 * - `CORS_ALLOWED`: Returns CORS-safelisted headers plus headers exposed via
 *   `Access-Control-Expose-Headers`.
 * - `OPAQUE_CROSS_ORIGIN`: Returns only CORS-safelisted response headers. Under the Fetch
 *   specification, opaque responses do not expose headers configured by `Access-Control-Expose-Headers`.
 *
 * @param request The network request whose headers are being filtered.
 * @param accessMode The evaluated response access mode for this request.
 * @returns Array of allowed header name/value pairs.
 */
export function getFilterableResponseHeaders(request, accessMode) {
    if (accessMode === "SAME_ORIGIN" /* ResponseAccessMode.SAME_ORIGIN */) {
        return request.responseHeaders;
    }
    if (accessMode === "OPAQUE_CROSS_ORIGIN" /* ResponseAccessMode.OPAQUE_CROSS_ORIGIN */) {
        return request.responseHeaders.filter(header => {
            const lowerName = header.name.toLowerCase().trim();
            return CORS_SAFELISTED_RESPONSE_HEADERS.has(lowerName);
        });
    }
    // For CORS_ALLOWED requests, parse Access-Control-Expose-Headers.
    const exposeHeadersValue = request.responseHeaderValue('access-control-expose-headers')?.trim() || '';
    const exposedSet = new Set(exposeHeadersValue.split(',').map(h => h.trim().toLowerCase()).filter(Boolean));
    const isCredentialed = isRequestCredentialed(request);
    const allowWildcardExposure = !isCredentialed && exposedSet.has('*');
    return request.responseHeaders.filter(header => {
        const lowerName = header.name.toLowerCase().trim();
        return CORS_SAFELISTED_RESPONSE_HEADERS.has(lowerName) || allowWildcardExposure || exposedSet.has(lowerName);
    });
}
//# sourceMappingURL=NetworkRequestAccess.js.map