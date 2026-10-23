import type * as Common from '../../../core/common/common.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that recommends reducing the size of the DOM tree as a means to improve page responsiveness. "DOM" is an acronym and should not be translated.
     */
    readonly title: 'Optimize DOM size';
    /**
     * @description Description of an insight that recommends reducing the size of the DOM tree as a means to improve page responsiveness. "DOM" is an acronym and should not be translated. "layout reflows" are when the browser will recompute the layout of content on the page.
     */
    readonly description: 'A large DOM can increase the duration of style calculations and layout reflows, impacting page responsiveness. A large DOM will also increase memory usage. [Learn how to avoid an excessive DOM size](https://developer.chrome.com/docs/performance/insights/dom-size).';
    /**
     * @description Header for a column containing the names of statistics as opposed to the actual statistic values.
     */
    readonly statistic: 'Statistic';
    /**
     * @description Header for a column containing the value of a statistic.
     */
    readonly value: 'Value';
    /**
     * @description Header for a column containing the page element related to a statistic.
     */
    readonly element: 'Element';
    /**
     * @description Label for a value representing the total number of elements on the page.
     */
    readonly totalElements: 'Total elements';
    /**
     * @description Label for a value representing the maximum depth of the Document Object Model (DOM). "DOM" is an acronym and should not be translated.
     */
    readonly maxDOMDepth: 'DOM depth';
    /**
     * @description Label for a value representing the maximum number of child elements of any parent element on the page.
     */
    readonly maxChildren: 'Most children';
    /**
     * @description Text for a section.
     */
    readonly topUpdatesDescription: 'These are the largest layout and style recalculation events. Their performance impact may be reduced by making the DOM simpler.';
    /**
     * @description Label used for a time duration.
     */
    readonly duration: 'Duration';
    /**
     * @description Message displayed in a table detailing how big a layout (rendering) is.
     * @example {134} PH1
     */
    readonly largeLayout: 'Layout ({PH1} objects)';
    /**
     * @description Message displayed in a table detailing how big a style recalculation (rendering) is.
     * @example {134} PH1
     */
    readonly largeStyleRecalc: 'Style recalculation ({PH1} elements)';
};
export declare const i18nString: i18n.LocalizeString;
export type DOMSizeInsightModel = InsightModel<typeof UIStrings, {
    largeLayoutUpdates: Types.Events.Layout[];
    largeStyleRecalcs: Types.Events.RecalcStyle[];
    largeUpdates: Array<{
        label: Common.UIString.LocalizedString;
        duration: Types.Timing.Milli;
        size: number;
        event: Types.Events.Event;
    }>;
    maxDOMStats?: Types.Events.DOMStats;
}>;
export declare function isDomSizeInsight(model: InsightModel): model is DOMSizeInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): DOMSizeInsightModel;
export declare function createOverlays(model: DOMSizeInsightModel): Types.Overlays.Overlay[];
