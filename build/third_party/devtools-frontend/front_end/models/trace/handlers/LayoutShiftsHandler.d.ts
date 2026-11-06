import type * as Protocol from '../../../generated/protocol.js';
import * as Types from '../types/types.js';
import { ScoreClassification } from './PageLoadMetricsHandler.js';
import type { HandlerName } from './types.js';
export interface LayoutShiftsData {
    clusters: readonly Types.Events.SyntheticLayoutShiftCluster[];
    sessionMaxScore: number;
    clsWindowID: number;
    prePaintEvents: readonly Types.Events.PrePaint[];
    paintImageEvents: Types.Events.PaintImage[];
    layoutInvalidationEvents: readonly Types.Events.LayoutInvalidationTracking[];
    scheduleStyleInvalidationEvents: readonly Types.Events.ScheduleStyleInvalidationTracking[];
    styleRecalcInvalidationEvents: readonly Types.Events.StyleRecalcInvalidationTracking[];
    renderFrameImplCreateChildFrameEvents: readonly Types.Events.RenderFrameImplCreateChildFrame[];
    domLoadingEvents: readonly Types.Events.DomLoading[];
    layoutImageUnsizedEvents: readonly Types.Events.LayoutImageUnsized[];
    remoteFonts: readonly RemoteFont[];
    scoreRecords: readonly ScoreRecord[];
    backendNodeIds: Set<Protocol.DOM.BackendNodeId>;
}
interface RemoteFont {
    display: string;
    url?: string;
    name?: string;
    beginRemoteFontLoadEvent: Types.Events.BeginRemoteFontLoad;
}
/**
 * This represents the maximum #time we will allow a cluster to go before we
 * reset it.
 **/
export declare const MAX_CLUSTER_DURATION: Types.Timing.Micro;
/**
 * This represents the maximum #time we will allow between layout shift events
 * before considering it to be the start of a new cluster.
 **/
export declare const MAX_SHIFT_TIME_DELTA: Types.Timing.Micro;
/**
 * Represents a point in time in which a  LS score change
 * was recorded.
 **/
interface ScoreRecord {
    ts: number;
    score: number;
}
export declare function reset(): void;
export declare function handleUserConfig(userConfig: Types.Configuration.Configuration): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): LayoutShiftsData;
export declare function deps(): HandlerName[];
export declare function scoreClassificationForLayoutShift(score: number): ScoreClassification;
/** Based on https://web.dev/cls/ **/
export declare enum LayoutShiftsThreshold {
    GOOD = 0,
    NEEDS_IMPROVEMENT = 0.1,
    BAD = 0.25
}
export {};
