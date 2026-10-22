import * as i18n from '../../../core/i18n/i18n.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides details about the fonts used on the page, and the value of their `font-display` properties.
     */
    readonly title: 'Font display';
    /**
     * @description Text to tell the user about the font-display CSS feature to help improve a the UX of a page.
     */
    readonly description: 'Consider setting [`font-display`](https://developer.chrome.com/docs/performance/insights/font-display) to `swap` or `optional` to ensure text is consistently visible. `swap` can be further optimized to mitigate layout shifts with [font metric overrides](https://developer.chrome.com/blog/font-fallbacks).';
    /**
     * @description Column for a font loaded by the page to render text.
     */
    readonly fontColumn: 'Font';
    /**
     * @description Column for the amount of time wasted.
     */
    readonly wastedTimeColumn: 'Wasted time';
    /**
     * @description Message shown when no fonts with suboptimal font-display are found.
     */
    readonly noFonts: 'No fonts with suboptimal font-display found';
};
export declare const i18nString: i18n.LocalizeString;
export interface RemoteFont {
    name?: string;
    request: Types.Events.SyntheticNetworkRequest;
    display: string;
    wastedTime: Types.Timing.Milli;
}
export type FontDisplayInsightModel = InsightModel<typeof UIStrings, {
    fonts: RemoteFont[];
}>;
export declare function isFontDisplayInsight(model: InsightModel): model is FontDisplayInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): FontDisplayInsightModel;
export declare function createOverlays(model: FontDisplayInsightModel): Types.Overlays.Overlay[];
