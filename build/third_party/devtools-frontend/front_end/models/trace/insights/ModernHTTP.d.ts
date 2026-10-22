import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that recommends using HTTP/2 over HTTP/1.1 because of the performance benefits. "HTTP" should not be translated.
     */
    readonly title: 'Modern HTTP';
    /**
     * @description Description of an insight that recommends using HTTP/2 over HTTP/1.1 because of the performance benefits. "HTTP" should not be translated.
     */
    readonly description: 'HTTP/2 and HTTP/3 offer many benefits over HTTP/1.1, such as multiplexing. [Learn more about using modern HTTP](https://developer.chrome.com/docs/performance/insights/modern-http).';
    /**
     * @description Column header for a table where each cell represents a network request.
     */
    readonly request: 'Request';
    /**
     * @description Column header for a table where each cell represents the protocol of a network request.
     */
    readonly protocol: 'Protocol';
    /**
     * @description Text explaining that there were no requests that were slowed down by using HTTP/1.1. "HTTP/1.1" should not be translated.
     */
    readonly noOldProtocolRequests: 'No requests used HTTP/1.1, or its current use of HTTP/1.1 doesn’t present a significant optimization opportunity. HTTP/1.1 requests are only flagged if six or more static assets originate from the same origin, and they aren’t served from a local development environment or a third-party source.';
};
export declare const i18nString: i18n.LocalizeString;
export type ModernHTTPInsightModel = InsightModel<typeof UIStrings, {
    http1Requests: Types.Events.SyntheticNetworkRequest[];
}>;
export declare function isModernHTTPInsight(model: InsightModel): model is ModernHTTPInsightModel;
/**
 * Determine the set of resources that aren't HTTP/2 but should be.
 * We're a little conservative about what we surface for a few reasons:
 *
 *    - The simulator approximation of HTTP/2 is a little more generous than reality.
 *    - There's a bit of debate surrounding HTTP/2 due to its worse performance in environments with high packet loss. [1][2][3]
 *    - It's something that you'd have absolutely zero control over with a third-party (can't defer to fix it for example).
 *
 * Therefore, we only surface requests that were...
 *
 *    - Served over HTTP/1.1 or earlier
 *    - Served over an origin that serves at least 6 static asset requests
 *      (if there aren't more requests than browser's max/host, multiplexing isn't as big a deal)
 *    - Not served on localhost (h2 is a pain to deal with locally & and CI)
 *
 * [1] https://news.ycombinator.com/item?id=19086639
 * [2] https://www.twilio.com/blog/2017/10/http2-issues.html
 * [3] https://www.cachefly.com/http-2-is-not-a-magic-bullet/
 */
export declare function determineHttp1Requests(requests: Types.Events.SyntheticNetworkRequest[], entityMappings: Handlers.Helpers.EntityMappings, firstPartyEntity: Handlers.Helpers.Entity | null): Types.Events.SyntheticNetworkRequest[];
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): ModernHTTPInsightModel;
export declare function createOverlayForRequest(request: Types.Events.SyntheticNetworkRequest): Types.Overlays.EntryOutline;
export declare function createOverlays(model: ModernHTTPInsightModel): Types.Overlays.Overlay[];
