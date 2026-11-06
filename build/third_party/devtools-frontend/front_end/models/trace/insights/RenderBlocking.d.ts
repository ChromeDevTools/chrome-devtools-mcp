import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import type * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides the user with the list of network requests that blocked and therefore slowed down the page rendering and becoming visible to the user.
     */
    readonly title: 'Render-blocking requests';
    /**
     * @description Text to describe that there are requests blocking rendering, which may affect LCP.
     */
    readonly description: `Requests are blocking the page’s initial render, which may delay LCP. [Deferring or inlining](https://developer.chrome.com/docs/performance/insights/render-blocking) can move these network requests out of the critical path.`;
    /**
     * @description Label to describe a network request (that happens to be render-blocking).
     */
    readonly renderBlockingRequest: 'Request';
    /**
     * @description Label used for a time duration.
     */
    readonly duration: 'Duration';
    /**
     * @description Text status indicating that no requests blocked the initial render of a navigation.
     */
    readonly noRenderBlocking: 'No render-blocking requests for this navigation';
};
export declare const i18nString: i18n.LocalizeString;
export declare function isRenderBlockingInsight(insight: InsightModel): insight is RenderBlockingInsightModel;
export type RenderBlockingInsightModel = InsightModel<typeof UIStrings, {
    renderBlockingRequests: Types.Events.SyntheticNetworkRequest[];
    requestIdToWastedMs?: Map<string, number>;
}>;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): RenderBlockingInsightModel;
export declare function createOverlayForRequest(request: Types.Events.SyntheticNetworkRequest): Types.Overlays.EntryOutline;
export declare function createOverlays(model: RenderBlockingInsightModel): Types.Overlays.Overlay[];
