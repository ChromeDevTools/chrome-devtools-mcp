import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import type * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Text to tell the user about the longest user interaction.
     */
    readonly description: 'Start investigating [how to improve INP](https://developer.chrome.com/docs/performance/insights/inp-breakdown) by looking at the longest subpart';
    /**
     * @description Title for the performance insight "INP breakdown", which shows a breakdown of INP by subparts / sections.
     */
    readonly title: 'INP breakdown';
    /**
     * @description Label used for the subpart/component/stage/section of a larger duration.
     */
    readonly subpart: 'Subpart';
    /**
     * @description Label used for a time duration.
     */
    readonly duration: 'Duration';
    /**
     * @description Text shown next to the interaction event's input delay time in the detail view.
     */
    readonly inputDelay: 'Input delay';
    /**
     * @description Text shown next to the interaction event's thread processing duration in the detail view.
     */
    readonly processingDuration: 'Processing duration';
    /**
     * @description Text shown next to the interaction event's presentation delay time in the detail view.
     */
    readonly presentationDelay: 'Presentation delay';
    /**
     * @description Text status indicating that no user interactions were detected.
     */
    readonly noInteractions: 'No interactions detected';
};
export declare const i18nString: i18n.LocalizeString;
export type INPBreakdownInsightModel = InsightModel<typeof UIStrings, {
    longestInteractionEvent?: Types.Events.SyntheticInteractionPair;
    highPercentileInteractionEvent?: Types.Events.SyntheticInteractionPair;
}>;
export declare function isINPBreakdownInsight(insight: InsightModel): insight is INPBreakdownInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): INPBreakdownInsightModel;
/**
 * If `subpart` is -1, then all subparts are included. Otherwise it's just that index.
 **/
export declare function createOverlaysForSubpart(event: Types.Events.SyntheticInteractionPair, subpartIndex?: number): Types.Overlays.Overlay[];
export declare function createOverlays(model: INPBreakdownInsightModel): Types.Overlays.Overlay[];
