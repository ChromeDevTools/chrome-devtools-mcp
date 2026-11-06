import type * as WebVitals from '../../../../third_party/web-vitals/web-vitals.js';
import type * as Trace from '../../../trace/trace.js';
export declare const EVENT_BINDING_NAME = "__chromium_devtools_metrics_reporter";
export declare const INTERNAL_KILL_SWITCH = "__chromium_devtools_kill_live_metrics";
export declare const SCRIPTS_PER_LOAF_LIMIT = 10;
export declare const LOAF_LIMIT = 5;
export type InteractionEntryGroupId = number & {
    _tag: 'InteractionEntryGroupId';
};
export type UniqueLayoutShiftId = `layout-shift-${number}-${number}`;
export declare function getUniqueLayoutShiftId(entry: LayoutShift): UniqueLayoutShiftId;
export interface LcpSubparts {
    timeToFirstByte: Trace.Types.Timing.Milli;
    resourceLoadDelay: Trace.Types.Timing.Milli;
    resourceLoadTime: Trace.Types.Timing.Milli;
    elementRenderDelay: Trace.Types.Timing.Milli;
}
export interface InpSubparts {
    inputDelay: Trace.Types.Timing.Milli;
    processingDuration: Trace.Types.Timing.Milli;
    presentationDelay: Trace.Types.Timing.Milli;
}
export interface LcpChangeEvent {
    name: 'LCP';
    value: Trace.Types.Timing.Milli;
    subparts: LcpSubparts;
    startedHidden: boolean;
    nodeIndex?: number;
}
export interface ClsChangeEvent {
    name: 'CLS';
    value: number;
    clusterShiftIds: UniqueLayoutShiftId[];
}
export interface InpChangeEvent {
    name: 'INP';
    value: Trace.Types.Timing.Milli;
    interactionType: WebVitals.INPAttribution['interactionType'];
    subparts: InpSubparts;
    startTime?: number;
    entryGroupId?: InteractionEntryGroupId;
}
export interface LoAFScript {
    Duration: number;
    'Invoker Type': string | null;
    Invoker: string | null;
    Function: string | null;
    Source: string | null;
    'Char position': number | null;
}
export interface PerformanceScriptTimingJSON {
    startTime: number;
    duration: number;
    invoker?: string;
    invokerType?: string;
    sourceFunctionName?: string;
    sourceURL?: string;
    sourceCharPosition?: number;
}
export interface PerformanceLongAnimationFrameTimingJSON {
    renderStart: DOMHighResTimeStamp;
    duration: DOMHighResTimeStamp;
    scripts: PerformanceScriptTimingJSON[];
}
/**
 * This event is not 1:1 with the interactions that the user sees in the
 * interactions log. It is 1:1 with a web-vitals entry.
 *
 * Note web-vitals can emit "fake" INP events without an interactionType nor a
 * nextPaintTime for small interactions after soft navs or bfcache restores.
 * For hardNavs these would have a FID event, but for soft navs or bfcache
 * restores there is no FID equivalent (it's only emitted once per page)
 * so dummy events without full details are used.
 */
export interface InteractionEntryEvent {
    name: 'InteractionEntry';
    interactionType?: WebVitals.INPAttribution['interactionType'];
    eventName?: string;
    entryGroupId?: InteractionEntryGroupId;
    startTime?: number;
    navigationId?: number;
    nextPaintTime?: number;
    duration: Trace.Types.Timing.Milli;
    subparts: InpSubparts;
    nodeIndex?: number;
    longAnimationFrameEntries: PerformanceLongAnimationFrameTimingJSON[];
}
export type NavigationType = WebVitals.Metric['navigationType'];
export interface LayoutShiftEvent {
    name: 'LayoutShift';
    score: number;
    uniqueLayoutShiftId: UniqueLayoutShiftId;
    affectedNodeIndices: number[];
}
export interface ResetEvent {
    name: 'reset';
    url?: string;
    navigationType?: NavigationType;
}
export declare function limitScripts(loafs: PerformanceLongAnimationFrameTimingJSON[]): PerformanceLongAnimationFrameTimingJSON[];
export declare function createInteractionEntryEvent(interaction: WebVitals.INPMetricWithAttribution): InteractionEntryEvent;
export declare function createInpChangeEvent(metric: WebVitals.INPMetricWithAttribution): InpChangeEvent;
export type WebVitalsEvent = LcpChangeEvent | ClsChangeEvent | InpChangeEvent | InteractionEntryEvent | LayoutShiftEvent | ResetEvent;
