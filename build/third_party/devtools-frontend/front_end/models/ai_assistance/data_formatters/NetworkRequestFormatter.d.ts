import * as SDK from '../../../core/sdk/sdk.js';
import * as Protocol from '../../../generated/protocol.js';
import * as Logs from '../../logs/logs.js';
import * as NetworkTimeCalculator from '../../network_time_calculator/network_time_calculator.js';
/**
 * Sanitizes headers by replacing unapproved header values with '<redacted>'.
 *
 * @param headers List of header name/value pairs to sanitize.
 * @returns Sanitized list of headers with unapproved values redacted.
 */
export declare function sanitizeHeaders(headers: Array<{
    name: string;
    value: string;
}>): Array<{
    name: string;
    value: string;
}>;
/**
 * Options for configuring {@link NetworkRequestFormatter}.
 */
export interface NetworkRequestFormatterOptions {
    /**
     * The security origin used to evaluate Same-Origin Policy (SOP) and Cross-Origin
     * Resource Sharing (CORS) access.
     *
     * This is required because evaluating access solely against `request.initiatorSecurityOrigin()`
     * is unsafe in cross-origin embedded contexts.
     *
     * Example:
     * When debugging a page at `https://example.com` (the active conversation origin), an embedded
     * `<iframe>` at `https://third-party.com` may fetch `https://third-party.com/api/user.json`.
     * Relative to the iframe, that request is same-origin (`request.initiatorSecurityOrigin() === https://third-party.com`).
     * However, from the perspective of the top-level conversation (`https://example.com`), that request
     * is cross-origin. Its response body and unexposed headers must be redacted to prevent leaking
     * unauthorized data into the prompt.
     */
    accessingSecurityOrigin: SDK.SecurityOrigin.SecurityOrigin;
    /** Optional network log instance for resolving initiator graphs. */
    networkLog?: Logs.NetworkLog.NetworkLog;
}
export declare class NetworkRequestFormatter {
    #private;
    /**
     * @param request The network request to format.
     * @param calculator Calculator for request timing metrics.
     * @param options Configuration options specifying the accessing security origin.
     */
    constructor(request: SDK.NetworkRequest.NetworkRequest, calculator: NetworkTimeCalculator.NetworkTransferTimeCalculator, options: NetworkRequestFormatterOptions);
    /**
     * Evaluates the response access mode for this network request relative to the accessing security origin.
     *
     * @returns The evaluated `ResponseAccessMode`.
     */
    responseAccessMode(): SDK.NetworkRequestAccess.ResponseAccessMode;
    static allowHeader(headerName: string): boolean;
    static formatHeaders(title: string, headers: Array<{
        name: string;
        value: string;
    }>, addListPrefixToEachLine?: boolean): string;
    static formatBody(title: string, request: SDK.NetworkRequest.NetworkRequest, maxBodySize: number): Promise<string>;
    /**
     * Returns the URL of `initiator` if it is same-origin with `request`, or a redaction
     * placeholder otherwise.
     *
     * Both sides use `requestURLSecurityOrigin()`, so imported HAR requests are compared
     * using their `imported-har://` origins.
     */
    static formatInitiatorUrl(initiator: SDK.NetworkRequest.NetworkRequest, request: SDK.NetworkRequest.NetworkRequest): string;
    static formatStatus(status: {
        statusCode: number;
        statusText: string;
        failed: boolean;
        canceled: boolean;
        preserved: boolean;
        finished: boolean;
    }): string;
    static formatFailureReasons(reasons: {
        blockedReason?: Protocol.Network.BlockedReason;
        corsErrorStatus?: Protocol.Network.CorsErrorStatus;
        localizedFailDescription?: string | null;
    }): string;
    formatRequestHeaders(): string;
    /**
     * Formats response headers for the AI prompt.
     *
     * Headers are filtered based on the request's evaluated ResponseAccessMode:
     * - Opaque cross-origin requests only include CORS-safelisted response headers.
     * - CORS-authorized requests include CORS-safelisted and Access-Control-Expose-Headers.
     * - Same-origin requests include all response headers.
     * Values of headers not present on the global allowedHeaders list are then redacted.
     */
    formatResponseHeaders(): string;
    /**
     * Formats the response body for the AI prompt.
     *
     * For opaque cross-origin requests, the response body is redacted because the accessing
     * security origin is forbidden by the Same-Origin Policy from reading it.
     */
    formatResponseBody(): Promise<string>;
    /**
     * Note: nothing here should include information from origins other than
     * the request's origin.
     */
    formatNetworkRequest(): Promise<string>;
    formatStatus(): string;
    formatFailureReasons(): string;
    /**
     * Note: nothing here should include information from origins other than
     * the request's origin.
     */
    formatRequestInitiatorChain(): string;
    formatNetworkRequestTiming(): string;
}
/**
 * Formats the initiator chain for a given network request into a formatted string.
 *
 * @param request The network request to format the initiator chain for.
 * @param networkLog Network log instance used to build the initiator graph.
 * @returns Formatted initiator chain.
 */
export declare function formatRequestInitiatorChain(request: SDK.NetworkRequest.NetworkRequest, networkLog: Logs.NetworkLog.NetworkLog): string;
