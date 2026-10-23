import * as Types from '../types/types.js';
export interface UserTimingsData {
    /**
     * Events triggered with the performance.measure() API.
     * https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure
     */
    performanceMeasures: readonly Types.Events.SyntheticUserTimingPair[];
    /**
     * Events triggered with the performance.mark() API.
     * https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark
     */
    performanceMarks: readonly Types.Events.PerformanceMark[];
    /**
     * Events triggered with the console.time(), console.timeEnd() and
     * console.timeLog() API.
     * https://developer.mozilla.org/en-US/docs/Web/API/console/time
     */
    consoleTimings: readonly Types.Events.SyntheticConsoleTimingPair[];
    /**
     * Events triggered with the console.timeStamp() API
     * https://developer.mozilla.org/en-US/docs/Web/API/console/timeStamp
     */
    timestampEvents: readonly Types.Events.ConsoleTimeStamp[];
    /**
     * Events triggered to trace the call to performance.measure itself,
     * cached by trace_id.
     */
    measureTraceByTraceId: Map<number, Types.Events.UserTimingMeasure>;
}
export declare function reset(): void;
/**
 * Similar to the default {@link Helpers.Trace.eventTimeComparator}
 * but with a twist:
 * In case of equal start and end times, put the second event (within a
 * track) first.
 *
 * Explanation:
 * User timing entries come as trace events dispatched when
 * performance.measure/mark is called. The trace events buffered in
 * devtools frontend are sorted by the start time. If their start time
 * is the same, then the event for the first call will appear first.
 *
 * When entries are meant to be stacked, the corresponding
 * performance.measure calls usually are done in bottom-up direction:
 * calls for children first and for parent later (because the call
 * is usually done when the measured task is over). This means that
 * when two user timing events have the same start and end time, usually
 * the second event is the parent of the first. Hence the switch.
 *
 */
export declare function userTimingComparator<T extends Types.Events.SyntheticEventPair | Types.Events.ConsoleTimeStamp>(a: T, b: T, originalIndex: ReadonlyMap<T, number>): number;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): UserTimingsData;
