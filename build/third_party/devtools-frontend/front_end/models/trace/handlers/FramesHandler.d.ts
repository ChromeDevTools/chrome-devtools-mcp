import * as Types from '../types/types.js';
import { type LayerTreeData } from './LayerTreeHandler.js';
import { type MetaHandlerData } from './MetaHandler.js';
import { type RendererHandlerData } from './RendererHandler.js';
import type { HandlerName } from './types.js';
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export interface FramesData {
    frames: readonly Types.Events.LegacyTimelineFrame[];
    framesById: Readonly<Record<number, Types.Events.LegacyTimelineFrame | undefined>>;
}
export declare function data(): FramesData;
export declare function deps(): HandlerName[];
export declare class TimelineFrameModel {
    #private;
    constructor(allEvents: readonly Types.Events.Event[], rendererData: RendererHandlerData, metaData: MetaHandlerData, layerTreeData: LayerTreeData);
    framesById(): Readonly<Record<number, TimelineFrame | undefined>>;
    frames(): TimelineFrame[];
}
/**
 * Legacy class that represents TimelineFrames that was ported from the old SDK.
 * This class is purposefully not exported as it breaks the abstraction that
 * every event shown on the timeline is a trace event. Instead, we use the Type
 * LegacyTimelineFrame to represent frames in the codebase. These do implement
 * the right interface to be treated just like they were a trace event.
 */
declare class TimelineFrame implements Types.Events.LegacyTimelineFrame {
    cat: string;
    name: string;
    ph: Types.Events.Phase;
    ts: Types.Timing.Micro;
    pid: Types.Events.ProcessID;
    tid: Types.Events.ThreadID;
    index: number;
    startTime: Types.Timing.Micro;
    startTimeOffset: Types.Timing.Micro;
    endTime: Types.Timing.Micro;
    duration: Types.Timing.Micro;
    idle: boolean;
    dropped: boolean;
    isPartial: boolean;
    layerTree: Types.Events.LegacyFrameLayerTreeData | null;
    paints: LayerPaintEvent[];
    mainFrameId: number | undefined;
    readonly seqId: number;
    constructor(seqId: number, startTime: Types.Timing.Micro, startTimeOffset: Types.Timing.Micro);
    setIndex(i: number): void;
    setEndTime(endTime: Types.Timing.Micro): void;
    setLayerTree(layerTree: Types.Events.LegacyFrameLayerTreeData | null): void;
    /**
     * Fake the `dur` field to meet the expected value given that we pretend
     * these TimelineFrame classes are trace events across the codebase.
     */
    get dur(): Types.Timing.Micro;
}
export declare class LayerPaintEvent implements Types.Events.LegacyLayerPaintEvent {
    #private;
    constructor(event: Types.Events.Paint, snapshot: Types.Events.DisplayItemListSnapshot);
    layerId(): number;
    event(): Types.Events.Paint;
    picture(): Types.Events.LegacyLayerPaintEventPicture | null;
}
export declare class PendingFrame {
    paints: LayerPaintEvent[];
    mainFrameId: number | undefined;
    triggerTime: number;
    constructor(triggerTime: number);
}
/** The parameters of an impl-side BeginFrame. **/
declare class BeginFrameInfo {
    seqId: number;
    startTime: Types.Timing.Micro;
    isDropped: boolean;
    isPartial: boolean;
    constructor(seqId: number, startTime: Types.Timing.Micro, isDropped: boolean, isPartial: boolean);
}
/**
 * A queue of BeginFrames pending visualization.
 * BeginFrames are added into this queue as they occur; later when their
 * corresponding DrawFrames occur (or lack thereof), the BeginFrames are removed
 * from the queue and their timestamps are used for visualization.
 **/
export declare class TimelineFrameBeginFrameQueue {
    private queueFrames;
    private mapFrames;
    addFrameIfNotExists(seqId: number, startTime: Types.Timing.Micro, isDropped: boolean, isPartial: boolean): void;
    setDropped(seqId: number, isDropped: boolean): void;
    setPartial(seqId: number, isPartial: boolean): void;
    processPendingBeginFramesOnDrawFrame(seqId: number): BeginFrameInfo[];
}
export declare function framesWithinWindow(frames: readonly Types.Events.LegacyTimelineFrame[], startTime: Types.Timing.Micro, endTime: Types.Timing.Micro): Types.Events.LegacyTimelineFrame[];
export {};
