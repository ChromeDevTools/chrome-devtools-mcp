import type * as Platform from '../platform/platform.js';
import type { NetworkRequest } from './NetworkRequest.js';
export declare class PageLoad {
    id: number;
    url: Platform.DevToolsPath.UrlString;
    startTime: number;
    loadTime: number;
    contentLoadTime: number;
    mainRequest: NetworkRequest;
    constructor(mainRequest: NetworkRequest);
    static forRequest(request: NetworkRequest): PageLoad | null;
    bindRequest(request: NetworkRequest): void;
    private static lastIdentifier;
}
