import type * as Common from '../../../core/common/common.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides details about the LCP metric, broken down by parts.
     */
    readonly title: 'LCP breakdown';
    /**
     * @description Description of a DevTools insight that presents a breakdown for the LCP metric by subparts.
     * This is displayed after a user expands the section to see more. No character length limits.
     */
    readonly description: 'Each [subpart has specific improvement strategies](https://developer.chrome.com/docs/performance/insights/lcp-breakdown). Ideally, most of the LCP time should be spent on loading the resources, not within delays.';
    /**
     * @description Time to first byte title for the Largest Contentful Paint's subparts timespan breakdown.
     */
    readonly timeToFirstByte: 'Time to first byte';
    /**
     * @description Resource load delay title for the Largest Contentful Paint subparts timespan breakdown.
     */
    readonly resourceLoadDelay: 'Resource load delay';
    /**
     * @description Resource load duration title for the Largest Contentful Paint subparts timespan breakdown.
     */
    readonly resourceLoadDuration: 'Resource load duration';
    /**
     * @description Element render delay title for the Largest Contentful Paint subparts timespan breakdown.
     */
    readonly elementRenderDelay: 'Element render delay';
    /**
     * @description Label used for the subpart (section) of a larger duration.
     */
    readonly subpart: 'Subpart';
    /**
     * @description Label used for the duration a single subpart (section) takes up of a larger duration.
     */
    readonly duration: 'Duration';
    /**
     * @description Label used for the duration a single subpart (section) takes up of a larger duration. The value will be the 75th percentile of aggregate data. "Field" means that the data was collected from real users in the field as opposed to the developers local environment. "Field" is synonymous with "Real user data".
     */
    readonly fieldDuration: 'Field p75';
    /**
     * @description Text status indicating that the Largest Contentful Paint (LCP) metric timing was not found. "LCP" is an acronym and should not be translated.
     */
    readonly noLcp: 'No LCP detected';
};
export declare const i18nString: i18n.LocalizeString;
/** A TraceWindow plus its UIString. **/
export type Subpart = Types.Timing.TraceWindowMicro & {
    label: Common.UIString.LocalizedString;
};
interface LCPSubparts {
    /**
     * The time between when the user initiates loading the page until when
     * the browser receives the first byte of the html response.
     */
    ttfb: Subpart;
    /**
     * The time between ttfb and the LCP request request being started.
     * For a text LCP, this is undefined given no request is loaded.
     */
    loadDelay?: Subpart;
    /**
     * The time it takes to load the LCP request.
     */
    loadDuration?: Subpart;
    /**
     * The time between when the LCP request finishes loading and when
     * the LCP element is rendered.
     */
    renderDelay: Subpart;
}
export declare function isLCPBreakdownInsight(model: InsightModel): model is LCPBreakdownInsightModel;
export type LCPBreakdownInsightModel = InsightModel<typeof UIStrings, {
    lcpMs?: Types.Timing.Milli;
    lcpTs?: Types.Timing.Milli;
    lcpEvent?: Types.Events.AnyLargestContentfulPaintCandidate;
    /** The network request for the LCP image, if there was one. */
    lcpRequest?: Types.Events.SyntheticNetworkRequest;
    subparts?: LCPSubparts;
}>;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): LCPBreakdownInsightModel;
export declare function createOverlays(model: LCPBreakdownInsightModel): Types.Overlays.Overlay[];
export {};
