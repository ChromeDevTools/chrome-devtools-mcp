import type { DispatchHttpRequestRequest, DispatchHttpRequestResult } from './InspectorFrontendHostAPI.js';
export declare enum ErrorType {
    HTTP_RESPONSE_UNAVAILABLE = "HTTP_RESPONSE_UNAVAILABLE",
    NOT_FOUND = "NOT_FOUND",
    ABORT = "ABORT"
}
export declare class DispatchHttpRequestError extends Error {
    readonly type: ErrorType;
    readonly response?: DispatchHttpRequestResult | undefined;
    constructor(type: ErrorType, response?: DispatchHttpRequestResult | undefined, options?: ErrorOptions);
}
export declare function makeHttpRequest<R>(request: DispatchHttpRequestRequest, options?: {
    signal?: AbortSignal;
}): Promise<R>;
