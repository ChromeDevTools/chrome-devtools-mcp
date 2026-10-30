import * as i18n from '../../../core/i18n/i18n.js';
import type * as Protocol from '../../../generated/protocol.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides details about Forced reflow.
     */
    readonly title: 'Forced reflow';
    /**
     * @description Text to describe the forced reflow.
     */
    readonly description: 'A forced reflow occurs when JavaScript queries geometric properties (such as `offsetWidth`) after styles have been invalidated by a change to the DOM state. This can result in poor performance. Learn more about [forced reflows](https://developer.chrome.com/docs/performance/insights/forced-reflow) and possible mitigations.';
    /**
     * @description Title of a list to provide related stack trace data.
     */
    readonly reflowCallFrames: 'Call frames that trigger reflow';
    /**
     * @description Text to describe the top time-consuming function call.
     */
    readonly topTimeConsumingFunctionCall: 'Top function call';
    /**
     * @description Text to describe the total reflow time.
     */
    readonly totalReflowTime: 'Total reflow time';
    /**
     * @description Text to describe CPU processor tasks that could not be attributed to any specific source code.
     */
    readonly unattributed: '[unattributed]';
    /**
     * @description Text for the name of anonymous functions.
     */
    readonly anonymous: '(anonymous)';
};
export declare const i18nString: i18n.LocalizeString;
export type ForcedReflowInsightModel = InsightModel<typeof UIStrings, {
    topLevelFunctionCallData: ForcedReflowAggregatedData | undefined;
    aggregatedBottomUpData: BottomUpCallStack[];
}>;
export interface BottomUpCallStack {
    /**
     * `null` indicates that this data is for unattributed force reflows.
     */
    bottomUpData: Types.Events.CallFrame | Protocol.Runtime.CallFrame | null;
    totalTime: number;
    relatedEvents: Types.Events.Event[];
}
export interface ForcedReflowAggregatedData {
    topLevelFunctionCall: Types.Events.CallFrame | Protocol.Runtime.CallFrame;
    totalReflowTime: number;
    topLevelFunctionCallEvents: Types.Events.Event[];
}
export declare function isForcedReflowInsight(model: InsightModel): model is ForcedReflowInsightModel;
export declare function generateInsight(traceParsedData: Handlers.Types.HandlerData, context: InsightSetContext): ForcedReflowInsightModel;
export declare function createOverlays(model: ForcedReflowInsightModel): Types.Overlays.Overlay[];
export declare function createOverlayForEvents(events: Types.Events.Event[], outlineReason?: 'ERROR' | 'INFO'): Types.Overlays.Overlay[];
