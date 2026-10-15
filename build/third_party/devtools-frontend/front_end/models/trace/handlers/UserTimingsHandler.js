// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
/**
 * IMPORTANT!
 * See UserTimings.md in this directory for some handy documentation on
 * UserTimings and the trace events we parse currently.
 **/
let syntheticEvents = [];
// There are two events dispatched for performance.measure calls: one to
// represent the measured timing in the tracing clock (which we type as
// PerformanceMeasure) and another one for the call itself (which we
// type as UserTimingMeasure). The two events corresponding to the same
// call are linked together by a common trace_id. The reason two events
// are dispatched is because the first was originally added with the
// implementation of the performance.measure API and it uses an
// overridden timestamp and duration. To prevent breaking potential deps
// created since then, a second event was added instead of changing the
// params of the first.
let measureTraceByTraceId = new Map();
let performanceMeasureEvents = [];
let performanceMarkEvents = [];
let consoleTimings = [];
let timestampEvents = [];
export function reset() {
    syntheticEvents = [];
    performanceMeasureEvents = [];
    performanceMarkEvents = [];
    consoleTimings = [];
    timestampEvents = [];
    measureTraceByTraceId = new Map();
}
const resourceTimingNames = [
    'workerStart',
    'redirectStart',
    'redirectEnd',
    'fetchStart',
    'domainLookupStart',
    'domainLookupEnd',
    'connectStart',
    'connectEnd',
    'secureConnectionStart',
    'requestStart',
    'responseStart',
    'responseEnd',
];
const navTimingNames = [
    'navigationStart',
    'unloadEventStart',
    'unloadEventEnd',
    'redirectStart',
    'redirectEnd',
    'fetchStart',
    'commitNavigationEnd',
    'domainLookupStart',
    'domainLookupEnd',
    'connectStart',
    'connectEnd',
    'secureConnectionStart',
    'requestStart',
    'responseStart',
    'responseEnd',
    'domLoading',
    'domInteractive',
    'domContentLoadedEventStart',
    'domContentLoadedEventEnd',
    'domComplete',
    'loadEventStart',
    'loadEventEnd',
];
// These are events dispatched under the blink.user_timing category
// but that the user didn't add. Filter them out so that they do not
// Appear in the timings track (they still appear in the main thread
// flame chart).
const ignoredNames = [...resourceTimingNames, ...navTimingNames];
function getEventTimings(event) {
    if ('dur' in event) {
        // It's a SyntheticEventPair.
        return { start: event.ts, end: Types.Timing.Micro(event.ts + (event.dur ?? 0)) };
    }
    if (Types.Events.isConsoleTimeStamp(event)) {
        const { start, end } = event.args.data || {};
        if (typeof start === 'number' && typeof end === 'number') {
            return { start: Types.Timing.Micro(start), end: Types.Timing.Micro(end) };
        }
    }
    // A ConsoleTimeStamp without start/end is just a point in time, so dur is 0.
    return { start: event.ts, end: event.ts };
}
function getEventTrack(event) {
    if (event.cat === 'blink.user_timing') {
        // This is a SyntheticUserTimingPair
        const detailString = event.args.data.beginEvent.args?.detail;
        if (detailString) {
            const details = Helpers.Trace.parseDevtoolsDetails(detailString, 'devtools');
            if (details && 'track' in details) {
                return details.track;
            }
        }
    }
    else if (Types.Events.isConsoleTimeStamp(event)) {
        const track = event.args.data?.track;
        return typeof track === 'string' ? track : undefined;
    }
    // SyntheticConsoleTimingPair does not have track info.
    return undefined;
}
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
export function userTimingComparator(a, b, originalIndex) {
    const { start: aStart, end: aEnd } = getEventTimings(a);
    const { start: bStart, end: bEnd } = getEventTimings(b);
    const timeDifference = Helpers.Trace.compareBeginAndEnd(aStart, bStart, aEnd, bEnd);
    if (timeDifference) {
        return timeDifference;
    }
    // Never re-order entries across different tracks.
    const aTrack = getEventTrack(a);
    const bTrack = getEventTrack(b);
    if (aTrack !== bTrack) {
        return 0; // Preserve current positions.
    }
    // When events share the same timestamp, use their original array position
    // to determine stacking order: children are appended after their parents,
    // so reversing by index ensures children render on top.
    // Uses a pre-computed index map for O(1) lookups instead of indexOf
    // to keep the overall sort at O(N log N).
    const aIndex = originalIndex.get(a) ?? -1;
    const bIndex = originalIndex.get(b) ?? -1;
    return bIndex - aIndex;
}
export function handleEvent(event) {
    if (ignoredNames.includes(event.name)) {
        return;
    }
    if (Types.Events.isUserTimingMeasure(event)) {
        measureTraceByTraceId.set(event.args.traceId, event);
    }
    if (Types.Events.isPerformanceMeasure(event)) {
        performanceMeasureEvents.push(event);
        return;
    }
    if (Types.Events.isPerformanceMark(event)) {
        performanceMarkEvents.push(event);
    }
    if (Types.Events.isConsoleTime(event)) {
        consoleTimings.push(event);
    }
    if (Types.Events.isConsoleTimeStamp(event)) {
        timestampEvents.push(event);
    }
}
export async function finalize() {
    const asyncEvents = [...performanceMeasureEvents, ...consoleTimings];
    syntheticEvents = Helpers.Trace.createMatchedSortedSyntheticEvents(asyncEvents);
    // Pre-compute event→index maps before sorting so the comparator can
    // resolve original positions in O(1). This keeps the sort O(N log N)
    // rather than O(N² log N) which would occur if the index were looked
    // up via indexOf or if the array were re-spread per comparison.
    const syntheticIndex = new Map(syntheticEvents.map((e, i) => [e, i]));
    syntheticEvents = syntheticEvents.sort((a, b) => userTimingComparator(a, b, syntheticIndex));
    const timestampIndex = new Map(timestampEvents.map((e, i) => [e, i]));
    timestampEvents = timestampEvents.sort((a, b) => userTimingComparator(a, b, timestampIndex));
}
export function data() {
    return {
        consoleTimings: syntheticEvents.filter(e => e.cat === 'blink.console'),
        performanceMeasures: syntheticEvents.filter(e => e.cat === 'blink.user_timing'),
        performanceMarks: performanceMarkEvents,
        timestampEvents,
        measureTraceByTraceId,
    };
}
//# sourceMappingURL=UserTimingsHandler.js.map