import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Protocol from '../../../generated/protocol.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext, type InsightSetContextWithNavigation } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that recommends avoiding chaining critical requests.
     */
    readonly title: 'Network dependency tree';
    /**
     * @description Description of an insight that recommends avoiding chaining critical requests.
     */
    readonly description: '[Avoid chaining critical requests](https://developer.chrome.com/docs/performance/insights/network-dependency-tree) by reducing the length of chains, reducing the download size of resources, or deferring the download of unnecessary resources to improve page load';
    /**
     * @description Description of the warning that recommends avoiding chaining critical requests.
     */
    readonly warningDescription: 'Avoid chaining critical requests by reducing the length of chains, reducing the download size of resources, or deferring the download of unnecessary resources to improve page load';
    /**
     * @description Text status indicating that there aren’t long chaining critical network requests.
     */
    readonly noNetworkDependencyTree: 'No rendering tasks impacted by network dependencies';
    /**
     * @description Text for the maximum critical path latency. This refers to the longest chain of network requests that
     * the browser must download before it can render the page.
     */
    readonly maxCriticalPathLatency: 'Max critical path latency:';
    /**
     * @description Label for a column in a data table; entries will be the network request.
     */
    readonly columnRequest: 'Request';
    /**
     * @description Label for a column in a data table; entries will be the time from main document till current network request.
     */
    readonly columnTime: 'Time';
    /**
     * @description Title of the table of the detected preconnect origins.
     */
    readonly preconnectOriginsTableTitle: 'Preconnected origins';
    /**
     * @description Description of the table of the detected preconnect origins.
     */
    readonly preconnectOriginsTableDescription: '[preconnect](https://developer.chrome.com/docs/lighthouse/performance/uses-rel-preconnect/) hints help the browser establish a connection earlier in the page load, saving time when the first request for that origin is made. The following are the origins that the page preconnected to.';
    /**
     * @description Text status indicating that no origins were preconnected.
     */
    readonly noPreconnectOrigins: 'No origins were preconnected';
    /**
     * @description A warning message that is shown when found more than 4 preconnected links. "preconnect" should not be translated.
     */
    readonly tooManyPreconnectLinksWarning: 'More than 4 `preconnect` connections were found. These should be used sparingly and only to the most important origins.';
    /**
     * @description A warning message that is shown when the user added preconnect for some unnecessary origins. "preconnect" should not be translated.
     */
    readonly unusedWarning: 'Unused preconnect. Only use `preconnect` for origins that the page is likely to request.';
    /**
     * @description A warning message that is shown when the user forgets to set the `crossorigin` HTML attribute, or setting it to an incorrect value, on the link is a common mistake when adding preconnect links. "preconnect" should not be translated.
     */
    readonly crossoriginWarning: 'Unused preconnect. Check that the `crossorigin` attribute is used properly.';
    /**
     * @description Label for a column in a data table; entries will be the source of the origin.
     */
    readonly columnSource: 'Source';
    /**
     * @description Text status indicating that there aren’t preconnect candidates.
     */
    readonly noPreconnectCandidates: 'No additional origins are good candidates for preconnecting';
    /**
     * @description Title of the table that shows the origins that the page should have preconnected to.
     */
    readonly estSavingTableTitle: 'Preconnect candidates';
    /**
     * @description Description of the table that recommends preconnecting to the origins to save time. "preconnect" should not be translated.
     */
    readonly estSavingTableDescription: 'Add [preconnect](https://developer.chrome.com/docs/lighthouse/performance/uses-rel-preconnect/) hints to your most important origins, but try to use no more than 4';
    /**
     * @description Label for a column in a data table; entries will be the origin of a web resource.
     */
    readonly columnOrigin: 'Origin';
    /**
     * @description Label for a column in a data table; entries will be the number of milliseconds the user could reduce page load by if they implemented the suggestions.
     */
    readonly columnWastedMs: 'Est LCP savings';
};
export declare const i18nString: i18n.LocalizeString;
export declare const TOO_MANY_PRECONNECTS_THRESHOLD = 4;
export interface CriticalRequestNode {
    request: Types.Events.SyntheticNetworkRequest;
    timeFromInitialRequest: Types.Timing.Micro;
    children: CriticalRequestNode[];
    isLongest?: boolean;
    relatedRequests: Set<Types.Events.SyntheticNetworkRequest>;
}
export type PreconnectedOrigin = PreconnectedOriginFromDom | PreconnectedOriginFromResponseHeader;
export interface PreconnectedOriginFromDom {
    node_id: Protocol.DOM.BackendNodeId;
    frame?: string;
    url: string;
    unused: boolean;
    crossorigin: boolean;
    source: 'DOM';
}
export interface PreconnectedOriginFromResponseHeader {
    url: string;
    headerText: string;
    request: Types.Events.SyntheticNetworkRequest;
    unused: boolean;
    crossorigin: boolean;
    source: 'ResponseHeader';
}
export interface PreconnectCandidate {
    origin: Platform.DevToolsPath.UrlString;
    wastedMs: Types.Timing.Milli;
}
export type NetworkDependencyTreeInsightModel = InsightModel<typeof UIStrings, {
    rootNodes: CriticalRequestNode[];
    maxTime: Types.Timing.Micro;
    fail: boolean;
    preconnectedOrigins: PreconnectedOrigin[];
    preconnectCandidates: PreconnectCandidate[];
}>;
/**
 * Parses an HTTP Link header string into an array of url and related header text.
 *
 * Export the function for test purpose.
 * @param linkHeaderValue The value of the HTTP Link header (e.g., '</style.css>; rel=preload; as=style, <https://example.com>; rel="preconnect"').
 * @returns An array of url and header text objects if it contains `rel=preconnect`.
 */
export declare function handleLinkResponseHeader(linkHeaderValue: string): Array<{
    url: string;
    headerText: string;
}>;
/** Export the function for test purpose. **/
export declare function generatePreconnectedOrigins(data: Handlers.Types.HandlerData, context: InsightSetContextWithNavigation, contextRequests: Types.Events.SyntheticNetworkRequest[], preconnectCandidates: PreconnectCandidate[]): PreconnectedOrigin[];
/** Export the function for test purpose. **/
export declare function generatePreconnectCandidates(data: Handlers.Types.HandlerData, context: InsightSetContextWithNavigation, contextRequests: Types.Events.SyntheticNetworkRequest[]): PreconnectCandidate[];
export declare function isNetworkDependencyTreeInsight(model: InsightModel): model is NetworkDependencyTreeInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): NetworkDependencyTreeInsightModel;
export declare function createOverlays(model: NetworkDependencyTreeInsightModel): Types.Overlays.Overlay[];
