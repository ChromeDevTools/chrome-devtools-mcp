import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type Checklist, type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides details about the LCP metric, and the network requests necessary to load it. Details how the LCP request was discoverable - in other words, the path necessary to load it (ex: network requests, JavaScript).
     */
    readonly title: 'LCP request discovery';
    /**
     * @description Description of an insight that provides details about the LCP metric, and the network requests necessary to load it.
     */
    readonly description: '[Optimize LCP](https://developer.chrome.com/docs/performance/insights/lcp-discovery) by making the LCP image discoverable from the HTML immediately, and avoiding lazy-loading';
    /**
     * @description Text to tell the user how long after the earliest discovery time their LCP element loaded.
     * @example {401ms} PH1
     */
    readonly lcpLoadDelay: 'LCP image loaded {PH1} after earliest start point';
    /**
     * @description Text to tell the user that a fetchpriority property value of "high" is applied to the LCP request.
     */
    readonly fetchPriorityApplied: 'fetchpriority=high applied';
    /**
     * @description Text to tell the user that a fetchpriority property value of "high" should be applied to the LCP request.
     */
    readonly fetchPriorityShouldBeApplied: 'fetchpriority=high should be applied';
    /**
     * @description Text to tell the user that a fetchpriority property value of "high" should be applied to the preload request that loads the LCP image.
     */
    readonly fetchPriorityShouldBeAppliedToImagePreload: 'fetchpriority=high should be applied to the image preload request';
    /**
     * @description Text to tell the user that the LCP request is discoverable in the initial document.
     */
    readonly requestDiscoverable: 'Request is discoverable in initial document';
    /**
     * @description Text to tell the user that LCP resources should avoid using loading=lazy.
     */
    readonly lazyLoadNotApplied: 'LCP resources shouldn’t use loading=lazy';
    /**
     * @description Text status indicating that the Largest Contentful Paint (LCP) metric timing was not found. "LCP" is an acronym and should not be translated.
     */
    readonly noLcp: 'No LCP detected';
    /**
     * @description Text status indicating that the Largest Contentful Paint (LCP) metric was text rather than an image. "LCP" is an acronym and should not be translated.
     */
    readonly noLcpResource: 'No LCP resource detected because the LCP isn’t an image';
};
export declare const i18nString: i18n.LocalizeString;
export declare function isLCPDiscoveryInsight(model: InsightModel): model is LCPDiscoveryInsightModel;
export type LCPDiscoveryInsightModel = InsightModel<typeof UIStrings, {
    lcpEvent?: Types.Events.AnyLargestContentfulPaintCandidate;
    /** The network request for the LCP image, if there was one. */
    lcpRequest?: Types.Events.SyntheticNetworkRequest;
    earliestDiscoveryTimeTs?: Types.Timing.Micro;
    checklist?: Checklist<'priorityHinted' | 'requestDiscoverable' | 'eagerlyLoaded'>;
}>;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): LCPDiscoveryInsightModel;
interface LCPImageDiscoveryData {
    checklist: Exclude<LCPDiscoveryInsightModel['checklist'], undefined>;
    request: Types.Events.SyntheticNetworkRequest;
    discoveryDelay: Types.Timing.Micro | null;
    estimatedSavings: Types.Timing.Milli | null;
}
/**
 * TODO: this extra transformation (getImageData) should not be necessary.
 */
export declare function getImageData(model: LCPDiscoveryInsightModel): LCPImageDiscoveryData | null;
export declare function createOverlays(model: LCPDiscoveryInsightModel): Types.Overlays.Overlay[];
export {};
