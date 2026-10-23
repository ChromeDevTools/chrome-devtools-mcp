import * as i18n from '../../../core/i18n/i18n.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import type * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides information and suggestions of resources that could improve their caching.
     */
    readonly title: 'Use efficient cache lifetimes';
    /**
     * @description Text to tell the user about how caching can help improve performance.
     */
    readonly description: 'A long cache lifetime can speed up repeat visits to your page. [Learn more about caching](https://developer.chrome.com/docs/performance/insights/cache).';
    /**
     * @description Column for a font loaded by the page to render text.
     */
    readonly requestColumn: 'Request';
    /**
     * @description Column for a resource cache's Time To Live.
     */
    readonly cacheTTL: 'Cache TTL';
    /**
     * @description Text describing that there were no requests found that need caching.
     */
    readonly noRequestsToCache: 'No requests with inefficient cache policies';
    /**
     * @description Table row value representing the remaining items not shown in the table due to size constraints. This row will always represent at least 2 items.
     * @example {5} PH1
     */
    readonly others: '{PH1} others';
};
export declare const i18nString: i18n.LocalizeString;
export type CacheInsightModel = InsightModel<typeof UIStrings, {
    requests: Array<{
        request: Types.Events.SyntheticNetworkRequest;
        ttl: number;
        wastedBytes: number;
    }>;
}>;
/**
 * Determines if a request is "cacheable".
 * A request is "cacheable" if it is of the appropriate protocol and resource type
 * (see Helpers.Network.NON_NETWORK_SCHEMES and Helpers.Network.STATIC_RESOURCE_TYPE)
 * and has the appropriate statusCodes.
 */
export declare function isCacheable(request: Types.Events.SyntheticNetworkRequest): boolean;
/**
 * Returns max-age if defined, otherwise expires header if defined, and null if not.
 */
export declare function computeCacheLifetimeInSeconds(headers: Array<{
    name: string;
    value: string;
}>, cacheControl: Helpers.Network.CacheControl | null): number | null;
export declare function getCombinedHeaders(responseHeaders: Array<{
    name: string;
    value: string;
}>): Map<string, string>;
/**
 * Returns whether a request contains headers that disable caching.
 * Disabled caching is checked on the 'cache-control' and 'pragma' headers.
 */
export declare function cachingDisabled(headers: Map<string, string> | null, parsedCacheControl: Helpers.Network.CacheControl | null): boolean;
export interface CacheableRequest {
    request: Types.Events.SyntheticNetworkRequest;
    ttl: number;
    wastedBytes: number;
}
export declare function isCacheInsight(model: InsightModel): model is CacheInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): CacheInsightModel;
export declare function createOverlayForRequest(request: Types.Events.SyntheticNetworkRequest): Types.Overlays.EntryOutline;
export declare function createOverlays(model: CacheInsightModel): Types.Overlays.Overlay[];
