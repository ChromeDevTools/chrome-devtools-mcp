// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as userTimingsData } from './UserTimingsHandler.js';
let extensionTrackEntries = [];
let extensionTrackData = [];
let extensionMarkers = [];
let entryToNode = new Map();
let timeStampByName = new Map();
let syntheticConsoleEntriesForTimingsTrack = [];
export function handleEvent(_event) {
    // Implementation not needed because data is sourced from UserTimingsHandler
}
export function reset() {
    extensionTrackEntries = [];
    syntheticConsoleEntriesForTimingsTrack = [];
    extensionTrackData = [];
    extensionMarkers = [];
    entryToNode = new Map();
    timeStampByName = new Map();
}
export async function finalize() {
    createExtensionFlameChartEntries();
}
function createExtensionFlameChartEntries() {
    const pairedMeasures = userTimingsData().performanceMeasures;
    const marks = userTimingsData().performanceMarks;
    const mergedRawExtensionEvents = Helpers.Trace.mergeEventsInOrder(pairedMeasures, marks);
    extractPerformanceAPIExtensionEntries(mergedRawExtensionEvents);
    extractConsoleAPIExtensionEntries();
    // extensionTrackEntries is filled by the above two calls.
    Helpers.Trace.sortTraceEventsInPlace(extensionTrackEntries);
    Helpers.Extensions.buildTrackDataFromExtensionEntries(extensionTrackEntries, extensionTrackData, entryToNode);
}
/**
 * Extracts extension entries from console.timeStamp events.
 *
 * Entries are built by pairing `console.timeStamp` events based on
 * their names. When a `console.timeStamp` event includes a `start`
 * argument (and optionally an `end` argument), it attempts to find
 * previously recorded `console.timeStamp` events with names matching
 * the `start` and `end` values. These matching events are then used to
 * determine the start and end times of the new entry.
 *
 * If a `console.timeStamp` event includes data for a custom track
 * (specified by the `track` argument), an extension track entry is
 * created and added to the `extensionTrackEntries` array. These entries
 * are used to visualize custom tracks in the Performance panel.
 *
 * If a `console.timeStamp` event includes data for a custom track
 * (specified by the `track` argument), an extension track entry is
 * created and added to the `extensionTrackEntries` array. These entries
 * are used to visualize custom tracks in the Performance panel.
 *
 * If a `console.timeStamp` event does not specify a custom track but
 * includes a start and/or end time (referencing other
 * `console.timeStamp` names), a synthetic console time stamp entry is
 * created and added to the `syntheticConsoleEntriesForTimingsTrack`
 * array. These entries are displayed in the "Timings" track.
 */
export function extractConsoleAPIExtensionEntries() {
    const consoleTimeStamps = userTimingsData().timestampEvents;
    for (const currentTimeStamp of consoleTimeStamps) {
        if (!currentTimeStamp.args.data) {
            continue;
        }
        const timeStampName = String(currentTimeStamp.args.data.name ?? currentTimeStamp.args.data.message);
        timeStampByName.set(timeStampName, currentTimeStamp);
        const { devtoolsObj: extensionData, userDetail } = extensionDataInConsoleTimeStamp(currentTimeStamp);
        const start = currentTimeStamp.args.data.start;
        const end = currentTimeStamp.args.data.end;
        if (!extensionData && !start && !end) {
            continue;
        }
        // If the start or end is a number, it's assumed to be a timestamp
        // from the tracing clock, so we use that directly, otherwise we
        // assume it's the label of a previous console timestamp, in which
        // case we use its corresponding timestamp.
        const startTimeStamp = typeof start === 'number' ? Types.Timing.Micro(start) : timeStampByName.get(String(start))?.ts;
        const endTimeStamp = typeof end === 'number' ? Types.Timing.Micro(end) : timeStampByName.get(String(end))?.ts;
        if (endTimeStamp !== undefined && startTimeStamp === undefined) {
            // Invalid data
            continue;
        }
        const entryStartTime = startTimeStamp ?? currentTimeStamp.ts;
        const entryEndTime = endTimeStamp ?? currentTimeStamp.ts;
        if (extensionData) {
            const unregisteredExtensionEntry = {
                ...currentTimeStamp,
                name: timeStampName,
                cat: 'devtools.extension',
                devtoolsObj: extensionData,
                userDetail,
                rawSourceEvent: currentTimeStamp,
                dur: Types.Timing.Micro(entryEndTime - entryStartTime),
                ts: entryStartTime,
                ph: Types.Events.Phase.COMPLETE,
            };
            const extensionEntry = Helpers.SyntheticEvents.SyntheticEventsManager
                .registerSyntheticEvent(unregisteredExtensionEntry);
            extensionTrackEntries.push(extensionEntry);
            continue;
        }
        // If no extension data is found in the entry (no custom track name
        // was passed), but the entry has a duration. we still save it here
        // to be added in the timings track. Note that timings w/o duration
        // and extension data are already handled by the UserTimingsHandler.
        const unregisteredSyntheticTimeStamp = {
            ...currentTimeStamp,
            name: timeStampName,
            cat: 'disabled-by-default-v8.inspector',
            ph: Types.Events.Phase.COMPLETE,
            ts: entryStartTime,
            dur: Types.Timing.Micro(entryEndTime - entryStartTime),
            rawSourceEvent: currentTimeStamp,
        };
        const syntheticTimeStamp = Helpers.SyntheticEvents.SyntheticEventsManager.registerSyntheticEvent(unregisteredSyntheticTimeStamp);
        syntheticConsoleEntriesForTimingsTrack.push(syntheticTimeStamp);
    }
}
/**
 * Extracts extension entries from Performance API events (marks and
 * measures).
 * It specifically looks for events that contain extension-specific data
 * within their `detail` property.
 *
 * If an event's `detail` property can be parsed as a JSON object and
 * contains a `devtools` field with a valid extension payload, a
 * synthetic extension entry is created. The type of extension entry
 * created depends on the payload:
 *
 * - If the payload conforms to `ExtensionPayloadMarker`, a
 *   `SyntheticExtensionMarker` is created and added to the
 *   `extensionMarkers` array. These markers represent single points in
 *   time.
 * - If the payload conforms to `ExtensionPayloadTrackEntry`, a
 *   `SyntheticExtensionTrackEntry` is created and added to the
 *   `extensionTrackEntries` array. These entries represent events with
 *   a duration and are displayed on custom tracks in the Performance
 *   panel.
 *
 * **Note:** Only events with a `detail` property that contains valid
 * extension data are processed. Other `performance.mark` and
 * `performance.measure` events are ignored.
 *
 * @param timings An array of `SyntheticUserTimingPair` or
 *                `PerformanceMark` events, typically obtained from the
 *                `UserTimingsHandler`.
 */
export function extractPerformanceAPIExtensionEntries(timings) {
    for (const timing of timings) {
        const { devtoolsObj, userDetail } = extensionDataInPerformanceTiming(timing);
        if (!devtoolsObj) {
            // Not an extension user timing.
            continue;
        }
        const extensionSyntheticEntry = {
            name: timing.name,
            ph: Types.Extensions.isExtensionPayloadMarker(devtoolsObj) ? Types.Events.Phase.INSTANT :
                Types.Events.Phase.COMPLETE,
            pid: timing.pid,
            tid: timing.tid,
            ts: timing.ts,
            dur: timing.dur,
            cat: 'devtools.extension',
            devtoolsObj,
            userDetail,
            rawSourceEvent: Types.Events.isSyntheticUserTiming(timing) ? timing.rawSourceEvent : timing,
        };
        if (Types.Extensions.isExtensionPayloadMarker(devtoolsObj)) {
            const extensionMarker = Helpers.SyntheticEvents.SyntheticEventsManager
                .registerSyntheticEvent(extensionSyntheticEntry);
            extensionMarkers.push(extensionMarker);
            continue;
        }
        if (Types.Extensions.isExtensionEntryObj(extensionSyntheticEntry.devtoolsObj)) {
            const extensionTrackEntry = Helpers.SyntheticEvents.SyntheticEventsManager
                .registerSyntheticEvent(extensionSyntheticEntry);
            extensionTrackEntries.push(extensionTrackEntry);
            continue;
        }
    }
}
/**
 * Parses out the data in a performance.measure / mark call into two parts:
 * 1. devtoolsObj: this is the data required to be passed by the user for the
 *    event to be used to create a custom track in the performance panel.
 * 2. userDetail: this is arbitrary data the user has attached to the event
 *    that we show in the summary drawer.
 */
export function extensionDataInPerformanceTiming(timing) {
    const timingDetail = Types.Events.isPerformanceMark(timing) ? timing.args.data?.detail : timing.args.data.beginEvent.args.detail;
    if (!timingDetail) {
        return { devtoolsObj: null, userDetail: null };
    }
    const devtoolsObj = Helpers.Trace.parseDevtoolsDetails(timingDetail, 'devtools');
    let userDetail = null;
    try {
        userDetail = JSON.parse(timingDetail);
        delete userDetail.devtools;
    }
    catch {
        // Nothing to do here, we still want to return the `devtools` part to make
        // this a custom event, even if the user detail failed to parse.
    }
    return { devtoolsObj, userDetail };
}
/**
 * Extracts extension data from a `console.timeStamp` event.
 *
 * Checks if a `console.timeStamp` event contains data intended for
 * creating a custom track entry in the DevTools Performance panel. It
 * specifically looks for a `track` argument within the event's data.
 *
 * If a `track` argument is present (and not an empty string), the
 * function constructs an `ExtensionTrackEntryPayload` object containing
 * the track name, an optional color, an optional track group. This
 * payload is then used to create a `SyntheticExtensionTrackEntry`.
 *
 * **Note:** The `color` argument is optional and its type is validated
 * against a predefined palette (see
 * `ExtensionUI::extensionEntryColor`).
 *
 * @param timeStamp The `ConsoleTimeStamp` event to extract data from.
 * @returns An `ExtensionTrackEntryPayload` object if the event contains
 *         valid extension data for a track entry, or `null` otherwise.
 */
export function extensionDataInConsoleTimeStamp(timeStamp) {
    if (!timeStamp.args.data || !timeStamp.args.data.track) {
        return { devtoolsObj: null, userDetail: null };
    }
    let userDetail = null;
    try {
        // While it's in the trace as 'devtools', it's just the 7th argument to console.timeStamp(), stringified.
        // If no data, fall back to falsy empty string.
        userDetail = JSON.parse(timeStamp.args.data?.devtools || '""');
    }
    catch {
    }
    const devtoolsObj = {
        // the color is defaulted to primary if it's value isn't one from
        // the defined palette (see ExtensionUI::extensionEntryColor) so
        // we don't need to check the value is valid here.
        color: String(timeStamp.args.data.color),
        track: String(timeStamp.args.data.track),
        dataType: 'track-entry',
        trackGroup: timeStamp.args.data.trackGroup !== undefined ? String(timeStamp.args.data.trackGroup) : undefined,
    };
    return { devtoolsObj, userDetail };
}
export function data() {
    return {
        entryToNode,
        extensionTrackData,
        extensionMarkers,
        syntheticConsoleEntriesForTimingsTrack,
    };
}
export function deps() {
    return ['UserTimings'];
}
//# sourceMappingURL=ExtensionTraceDataHandler.js.map