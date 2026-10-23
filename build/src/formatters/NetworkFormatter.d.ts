/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * */
import { type HTTPRequest } from '../third_party/index.js';
/**
 * How long to wait for a response body. Puppeteer reads a body only after the
 * response finished loading, with no timeout of its own, and a response that
 * never finishes (e.g. a `Cache-Control: no-store` response the page did not
 * read) would otherwise hold the tool mutex forever.
 */
export declare const RESPONSE_BODY_TIMEOUT_MS = 5000;
export interface NetworkFormatterOptions {
    requestId?: number | string;
    selectedInDevToolsUI?: boolean;
    requestIdResolver?: (request: HTTPRequest) => number | string;
    fetchData?: boolean;
    requestFilePath?: string;
    responseFilePath?: string;
    saveFile?: (data: Uint8Array<ArrayBufferLike>, filename: string, extension: '.network-request' | '.network-response') => Promise<{
        filename: string;
    }>;
    redactNetworkHeaders: boolean;
    /** Defaults to `RESPONSE_BODY_TIMEOUT_MS`. */
    responseBodyTimeout?: number;
}
interface NetworkRequestConcise {
    requestId?: number | string;
    method: string;
    url: string;
    status: string;
    selectedInDevToolsUI?: boolean;
}
interface NetworkRequestDetailed extends NetworkRequestConcise {
    requestHeaders: Record<string, string>;
    requestBody?: string;
    requestBodyFilePath?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    responseBodyFilePath?: string;
    failure?: string;
    redirectChain?: NetworkRequestConcise[];
}
export declare class NetworkFormatter {
    #private;
    private constructor();
    static from(request: HTTPRequest, options: NetworkFormatterOptions): Promise<NetworkFormatter>;
    toString(): string;
    toStringDetailed(): string;
    toJSON(): NetworkRequestConcise;
    toJSONDetailed(): NetworkRequestDetailed;
}
export {};
