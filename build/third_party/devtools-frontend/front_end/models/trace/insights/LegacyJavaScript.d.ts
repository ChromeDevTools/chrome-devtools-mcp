import * as i18n from '../../../core/i18n/i18n.js';
import type * as Handlers from '../handlers/handlers.js';
import type * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that identifies polyfills for modern JavaScript features, and recommends their removal.
     */
    readonly title: 'Legacy JavaScript';
    /**
     * @description Description of an insight that identifies polyfills for modern JavaScript features, and recommends their removal.
     */
    readonly description: 'Polyfills and transforms enable older browsers to use new JavaScript features. However, many aren’t necessary for modern browsers. Consider modifying your JavaScript build process to not transpile [Baseline](https://web.dev/articles/baseline-and-polyfills) features, unless you know you must support older browsers. [Learn why most sites can deploy ES6+ code without transpiling](https://developer.chrome.com/docs/performance/insights/legacy-javascript).';
    /**
     * @description Label for a column in a data table; entries will be the individual JavaScript scripts.
     */
    readonly columnScript: 'Script';
    /**
     * @description Label for a column in a data table; entries will be the number of wasted bytes (aka the estimated savings in terms of bytes).
     */
    readonly columnWastedBytes: 'Wasted bytes';
    /**
     * @description Message shown when no legacy JavaScript is found.
     */
    readonly noLegacyJavaScript: 'No legacy JavaScript found';
};
export declare const i18nString: i18n.LocalizeString;
export interface PatternMatchResult {
    name: string;
    line: number;
    column: number;
}
interface LegacyJavaScriptResult {
    matches: PatternMatchResult[];
    estimatedByteSavings: number;
}
type LegacyJavaScriptResults = Map<Handlers.ModelHandlers.Scripts.Script, LegacyJavaScriptResult>;
export type LegacyJavaScriptInsightModel = InsightModel<typeof UIStrings, {
    legacyJavaScriptResults: LegacyJavaScriptResults;
}>;
export declare function isLegacyJavaScript(model: InsightModel): model is LegacyJavaScriptInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): LegacyJavaScriptInsightModel;
export declare function createOverlays(model: LegacyJavaScriptInsightModel): Types.Overlays.Overlay[];
export {};
