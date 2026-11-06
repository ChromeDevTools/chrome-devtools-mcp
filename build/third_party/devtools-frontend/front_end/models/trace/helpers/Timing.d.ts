import * as Types from '../types/types.js';
export declare const milliToMicro: (value: Types.Timing.Milli) => Types.Timing.Micro;
export declare const secondsToMilli: (value: Types.Timing.Seconds) => Types.Timing.Milli;
export declare const secondsToMicro: (value: Types.Timing.Seconds) => Types.Timing.Micro;
export declare const microToMilli: (value: Types.Timing.Micro) => Types.Timing.Milli;
export declare const microToSeconds: (value: Types.Timing.Micro) => Types.Timing.Seconds;
export declare function timeStampForEventAdjustedByClosestNavigation(event: Types.Events.Event, traceBounds: Types.Timing.TraceWindowMicro, navigationsByNavigationId: Map<string, Types.Events.NavigationStart>, softNavigationsById: Map<number, Types.Events.SoftNavigationStart>, navigationsByFrameId: Map<string, Types.Events.NavigationStart[]>): Types.Timing.Micro;
/**
 * Expands the trace window by a provided percentage or, if it the expanded window is smaller than 1 millisecond, expands it to 1 millisecond.
 * If the expanded window is outside of the max trace window, cut the overflowing bound to the max trace window bound.
 **/
export declare function expandWindowByPercentOrToOneMillisecond(annotationWindow: Types.Timing.TraceWindowMicro, maxTraceWindow: Types.Timing.TraceWindowMicro, percentage: number): Types.Timing.TraceWindowMicro;
export interface EventTimingsData<ValueType extends Types.Timing.Micro | Types.Timing.Milli | Types.Timing.Seconds> {
    startTime: ValueType;
    endTime: ValueType;
    duration: ValueType;
}
export declare function eventTimingsMicroSeconds(event: Types.Events.Event): EventTimingsData<Types.Timing.Micro>;
export declare function eventTimingsMilliSeconds(event: Types.Events.Event): EventTimingsData<Types.Timing.Milli>;
export declare function traceWindowMilliSeconds(bounds: Types.Timing.TraceWindowMicro): Types.Timing.TraceWindowMilli;
export declare function traceWindowMicroSecondsToMilliSeconds(bounds: Types.Timing.TraceWindowMicro): Types.Timing.TraceWindowMilli;
export declare function traceWindowFromMilliSeconds(min: Types.Timing.Milli, max: Types.Timing.Milli): Types.Timing.TraceWindowMicro;
export declare function traceWindowFromMicroSeconds(min: Types.Timing.Micro, max: Types.Timing.Micro): Types.Timing.TraceWindowMicro;
export declare function traceWindowFromEvent(event: Types.Events.Event): Types.Timing.TraceWindowMicro;
export declare function traceWindowFromOverlay(overlay: Types.Overlays.Overlay): Types.Timing.TraceWindowMicro | null;
/**
 * Combines (as in a union) multiple windows into one.
 */
export declare function combineTraceWindowsMicro(windows: Types.Timing.TraceWindowMicro[]): Types.Timing.TraceWindowMicro | null;
export interface BoundsIncludeTimeRange {
    timeRange: Types.Timing.TraceWindowMicro;
    bounds: Types.Timing.TraceWindowMicro;
}
/**
 * Checks to see if the timeRange is within the bounds. By "within" we mean
 * "has any overlap":
 *         |------------------------|
 *      ==                                     no overlap (entirely before)
 *       =========                             overlap
 *            =========                        overlap
 *                             =========       overlap
 *                                     ====    no overlap (entirely after)
 *        ==============================       overlap (time range is larger than bounds)
 *         |------------------------|
 */
export declare function boundsIncludeTimeRange(data: BoundsIncludeTimeRange): boolean;
/** Checks to see if the event is within or overlaps the bounds */
export declare function eventIsInBounds(event: Types.Events.Event, bounds: Types.Timing.TraceWindowMicro): boolean;
export declare function timestampIsInBounds(bounds: Types.Timing.TraceWindowMicro, timestamp: Types.Timing.Micro): boolean;
export interface WindowFitsInsideBounds {
    window: Types.Timing.TraceWindowMicro;
    bounds: Types.Timing.TraceWindowMicro;
}
/**
 * Returns true if the window fits entirely within the bounds.
 * Note that if the window is equivalent to the bounds, that is considered to fit
 */
export declare function windowFitsInsideBounds(data: WindowFitsInsideBounds): boolean;
export declare function windowsEqual(w1: Types.Timing.TraceWindowMicro, w2: Types.Timing.TraceWindowMicro): boolean;
