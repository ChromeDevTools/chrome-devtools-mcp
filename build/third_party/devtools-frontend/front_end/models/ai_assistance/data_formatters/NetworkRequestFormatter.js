// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
import * as TextUtils from '../../../core/text_utils/text_utils.js';
import * as Logs from '../../logs/logs.js';
import * as NetworkTimeCalculator from '../../network_time_calculator/network_time_calculator.js';
import { seconds } from './UnitFormatters.js';
const MAX_HEADERS_SIZE = 1000;
const MAX_BODY_SIZE = 10000;
/**
 * Sanitizes headers by replacing unapproved header values with '<redacted>'.
 *
 * @param headers List of header name/value pairs to sanitize.
 * @returns Sanitized list of headers with unapproved values redacted.
 */
export function sanitizeHeaders(headers) {
    return headers.map(header => {
        if (NetworkRequestFormatter.allowHeader(header.name)) {
            return header;
        }
        return { name: header.name, value: '<redacted>' };
    });
}
export class NetworkRequestFormatter {
    #calculator;
    #request;
    #networkLog;
    #accessingSecurityOrigin;
    /**
     * @param request The network request to format.
     * @param calculator Calculator for request timing metrics.
     * @param options Configuration options specifying the accessing security origin.
     */
    constructor(request, calculator, options) {
        this.#request = request;
        this.#calculator = calculator;
        this.#networkLog = options.networkLog;
        this.#accessingSecurityOrigin = options.accessingSecurityOrigin;
    }
    /**
     * Evaluates the response access mode for this network request relative to the accessing security origin.
     *
     * @returns The evaluated `ResponseAccessMode`.
     */
    responseAccessMode() {
        return SDK.NetworkRequestAccess.evaluateResponseAccessMode(this.#request, this.#accessingSecurityOrigin);
    }
    static allowHeader(headerName) {
        return allowedHeaders.has(headerName.toLowerCase().trim());
    }
    static formatHeaders(title, headers, addListPrefixToEachLine) {
        return formatLines(title, sanitizeHeaders(headers).map(header => {
            const prefix = addListPrefixToEachLine ? '- ' : '';
            return prefix + header.name + ': ' + header.value + '\n';
        }), MAX_HEADERS_SIZE);
    }
    static async formatBody(title, request, maxBodySize) {
        const data = await request.requestContentDataIfAvailable();
        if (TextUtils.ContentData.ContentData.isError(data)) {
            return request.finished ? '' : `${title}\n<not available: the request has not finished loading>`;
        }
        if (data.isEmpty) {
            return `${title}\n<empty response>`;
        }
        if (data.isTextContent) {
            const dataAsText = data.text;
            if (dataAsText.length > maxBodySize) {
                return `${title}\n${dataAsText.substring(0, maxBodySize) + '... <truncated>'}`;
            }
            return `${title}\n${dataAsText}`;
        }
        return `${title}\n<binary data>`;
    }
    /**
     * Returns the URL of `initiator` if it is same-origin with `request`, or a redaction
     * placeholder otherwise.
     *
     * Both sides use `requestURLSecurityOrigin()`, so imported HAR requests are compared
     * using their `imported-har://` origins.
     */
    static formatInitiatorUrl(initiator, request) {
        if (initiator.requestURLSecurityOrigin().isSameOriginWith(request.requestURLSecurityOrigin())) {
            return initiator.url();
        }
        return '<redacted cross-origin initiator URL>';
    }
    static formatStatus(status) {
        let responseStatus = '';
        if (status.statusCode) {
            const statusText = status.statusText ? ` ${status.statusText}` : '';
            responseStatus = `Response status: ${status.statusCode}${statusText}\n`;
        }
        const flags = [];
        flags.push(status.finished ? 'finished' : 'pending');
        if (status.failed) {
            flags.push('failed');
        }
        if (status.canceled) {
            flags.push('canceled');
        }
        if (status.preserved) {
            flags.push('preserved');
        }
        const requestStatus = flags.length > 0 ? `Network request status: ${flags.join(', ')}\n` : '';
        return `${responseStatus}${requestStatus}`;
    }
    static formatFailureReasons(reasons) {
        const lines = [];
        if (reasons.blockedReason) {
            if (reasons.blockedReason === "inspector" /* Protocol.Network.BlockedReason.Inspector */) {
                lines.push('Blocked reason: a custom network condition in DevTools is blocking this request');
            }
            else {
                lines.push(`Blocked reason: ${reasons.blockedReason}`);
            }
        }
        if (reasons.corsErrorStatus) {
            lines.push(`CORS error: ${reasons.corsErrorStatus.corsError} ${reasons.corsErrorStatus.failedParameter}`);
        }
        if (reasons.localizedFailDescription) {
            lines.push(`Fail description: ${reasons.localizedFailDescription}`);
        }
        return lines.length > 0 ? `${lines.join('\n')}\n` : '';
    }
    formatRequestHeaders() {
        return NetworkRequestFormatter.formatHeaders('Request headers:', this.#request.requestHeaders());
    }
    /**
     * Formats response headers for the AI prompt.
     *
     * Headers are filtered based on the request's evaluated ResponseAccessMode:
     * - Opaque cross-origin requests only include CORS-safelisted response headers.
     * - CORS-authorized requests include CORS-safelisted and Access-Control-Expose-Headers.
     * - Same-origin requests include all response headers.
     * Values of headers not present on the global allowedHeaders list are then redacted.
     */
    formatResponseHeaders() {
        const accessMode = this.responseAccessMode();
        const headers = SDK.NetworkRequestAccess.getFilterableResponseHeaders(this.#request, accessMode);
        return NetworkRequestFormatter.formatHeaders('Response headers:', headers);
    }
    /**
     * Formats the response body for the AI prompt.
     *
     * For opaque cross-origin requests, the response body is redacted because the accessing
     * security origin is forbidden by the Same-Origin Policy from reading it.
     */
    async formatResponseBody() {
        if (this.responseAccessMode() === "OPAQUE_CROSS_ORIGIN" /* SDK.NetworkRequestAccess.ResponseAccessMode.OPAQUE_CROSS_ORIGIN */) {
            return SDK.NetworkRequestAccess.REDACTED_RESPONSE_BODY;
        }
        return await NetworkRequestFormatter.formatBody('Response body:', this.#request, MAX_BODY_SIZE);
    }
    /**
     * Note: nothing here should include information from origins other than
     * the request's origin.
     */
    async formatNetworkRequest() {
        let responseBody = await this.formatResponseBody();
        if (responseBody) {
            // if we have a response then we add 2 new line to follow same structure of the context
            responseBody = `\n\n${responseBody}`;
        }
        return `Request: ${this.#request.url()}
${this.formatRequestHeaders()}

${this.formatResponseHeaders()}${responseBody}

${this.formatStatus()}${this.formatFailureReasons()}
Request timing:\n${this.formatNetworkRequestTiming()}

Request initiator chain:\n${this.formatRequestInitiatorChain()}`;
    }
    formatStatus() {
        return NetworkRequestFormatter.formatStatus({
            statusCode: this.#request.statusCode,
            statusText: this.#request.statusText,
            failed: this.#request.failed,
            canceled: this.#request.canceled,
            preserved: this.#request.preserved,
            finished: this.#request.finished,
        });
    }
    formatFailureReasons() {
        return NetworkRequestFormatter.formatFailureReasons({
            blockedReason: this.#request.blockedReason(),
            corsErrorStatus: this.#request.corsErrorStatus(),
            localizedFailDescription: this.#request.localizedFailDescription,
        });
    }
    /**
     * Note: nothing here should include information from origins other than
     * the request's origin.
     */
    formatRequestInitiatorChain() {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const networkLog = this.#networkLog ?? Logs.NetworkLog.NetworkLog.instance();
        return formatRequestInitiatorChain(this.#request, networkLog);
    }
    formatNetworkRequestTiming() {
        const results = NetworkTimeCalculator.calculateRequestTimeRanges(this.#request, this.#calculator.minimumBoundary());
        const getDuration = (name) => {
            const result = results.find(r => r.name === name);
            if (!result) {
                return;
            }
            return seconds(result.end - result.start);
        };
        const labels = [
            {
                label: 'Queued at (timestamp)',
                value: seconds(this.#request.issueTime() - this.#calculator.zeroTime()),
            },
            {
                label: 'Started at (timestamp)',
                value: seconds(this.#request.startTime - this.#calculator.zeroTime()),
            },
            {
                label: 'Queueing (duration)',
                value: getDuration('queueing'),
            },
            {
                label: 'Connection start (stalled) (duration)',
                value: getDuration('blocking'),
            },
            {
                label: 'Request sent (duration)',
                value: getDuration('sending'),
            },
            {
                label: 'Waiting for server response (duration)',
                value: getDuration('waiting'),
            },
            {
                label: 'Content download (duration)',
                value: getDuration('receiving'),
            },
            {
                label: 'Duration (duration)',
                value: getDuration('total'),
            },
        ];
        return labels.filter(label => !!label.value).map(label => `${label.label}: ${label.value}`).join('\n');
    }
}
/**
 * Formats the initiator chain for a given network request into a formatted string.
 *
 * @param request The network request to format the initiator chain for.
 * @param networkLog Network log instance used to build the initiator graph.
 * @returns Formatted initiator chain.
 */
export function formatRequestInitiatorChain(request, networkLog) {
    let initiatorChain = '';
    let lineStart = '- URL: ';
    const graph = networkLog.initiatorGraphForRequest(request);
    for (const initiator of Array.from(graph.initiators).reverse()) {
        initiatorChain = initiatorChain + lineStart + NetworkRequestFormatter.formatInitiatorUrl(initiator, request) + '\n';
        lineStart = '\t' + lineStart;
        if (initiator === request) {
            initiatorChain = formatRequestInitiated(graph.initiated, request, request, initiatorChain, lineStart);
        }
    }
    return initiatorChain.trim();
}
function formatRequestInitiated(initiated, rootRequest, parentRequest, initiatorChain, lineStart) {
    const visited = new Set();
    // rootRequest should be already in the tree when building initiator part
    visited.add(rootRequest);
    for (const [keyRequest, initiatedRequest] of initiated.entries()) {
        if (initiatedRequest === parentRequest) {
            if (!visited.has(keyRequest)) {
                visited.add(keyRequest);
                initiatorChain =
                    initiatorChain + lineStart + NetworkRequestFormatter.formatInitiatorUrl(keyRequest, rootRequest) + '\n';
                initiatorChain = formatRequestInitiated(initiated, rootRequest, keyRequest, initiatorChain, '\t' + lineStart);
            }
        }
    }
    return initiatorChain;
}
// Header names that could be included in the prompt, lowercase.
const allowedHeaders = new Set([
    ':authority',
    ':method',
    ':path',
    ':scheme',
    'a-im',
    'accept-ch',
    'accept-charset',
    'accept-datetime',
    'accept-encoding',
    'accept-language',
    'accept-patch',
    'accept-ranges',
    'accept',
    'access-control-allow-credentials',
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'access-control-expose-headers',
    'access-control-max-age',
    'access-control-request-headers',
    'access-control-request-method',
    'age',
    'allow',
    'alt-svc',
    'cache-control',
    'connection',
    'content-disposition',
    'content-encoding',
    'content-language',
    'content-location',
    'content-range',
    'content-security-policy',
    'content-type',
    'correlation-id',
    'date',
    'delta-base',
    'dnt',
    'expect-ct',
    'expect',
    'expires',
    'forwarded',
    'front-end-https',
    'host',
    'http2-settings',
    'if-modified-since',
    'if-range',
    'if-unmodified-source',
    'im',
    'last-modified',
    'link',
    'location',
    'max-forwards',
    'nel',
    'origin',
    'permissions-policy',
    'pragma',
    'preference-applied',
    'proxy-connection',
    'public-key-pins',
    'range',
    'referer',
    'refresh',
    'report-to',
    'retry-after',
    'save-data',
    'sec-gpc',
    'server',
    'status',
    'strict-transport-security',
    'te',
    'timing-allow-origin',
    'tk',
    'trailer',
    'transfer-encoding',
    'upgrade-insecure-requests',
    'upgrade',
    'user-agent',
    'vary',
    'via',
    'warning',
    'www-authenticate',
    'x-att-deviceid',
    'x-content-duration',
    'x-content-security-policy',
    'x-content-type-options',
    'x-correlation-id',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-frame-options',
    'x-http-method-override',
    'x-powered-by',
    'x-redirected-by',
    'x-request-id',
    'x-requested-with',
    'x-ua-compatible',
    'x-wap-profile',
    'x-webkit-csp',
    'x-xss-protection',
]);
function formatLines(title, lines, maxLength) {
    let result = '';
    for (const line of lines) {
        if (result.length + line.length > maxLength) {
            break;
        }
        result += line;
    }
    result = result.trim();
    return result && title ? title + '\n' + result : result;
}
//# sourceMappingURL=NetworkRequestFormatter.js.map