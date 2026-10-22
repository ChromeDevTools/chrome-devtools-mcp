import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides details about if the page's viewport is optimized for mobile viewing.
     */
    readonly title: 'Optimize viewport for mobile';
    /**
     * @description Text to tell the user how a viewport meta element can improve performance. \xa0 is a non-breaking space
     */
    readonly description: 'Tap interactions may be [delayed by up to 300 ms](https://developer.chrome.com/docs/performance/insights/viewport) if the viewport isn’t optimized for mobile';
    /**
     * @description Text for a label describing the portion of an interaction event that was delayed due to a bad mobile viewport.
     */
    readonly mobileTapDelayLabel: 'Mobile tap delay';
};
export declare const i18nString: i18n.LocalizeString;
export type ViewportInsightModel = InsightModel<typeof UIStrings, {
    mobileOptimized: boolean | null;
    viewportEvent?: Types.Events.ParseMetaViewport;
    longPointerInteractions?: Types.Events.SyntheticInteractionPair[];
}>;
export declare function isViewportInsight(model: InsightModel): model is ViewportInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): ViewportInsightModel;
export declare function createOverlays(model: ViewportInsightModel): Types.Overlays.Overlay[];
