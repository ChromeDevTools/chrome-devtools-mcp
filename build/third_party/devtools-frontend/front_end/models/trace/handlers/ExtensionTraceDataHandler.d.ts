import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import type { HandlerName } from './types.js';
export interface ExtensionTraceData {
    extensionTrackData: readonly Types.Extensions.ExtensionTrackData[];
    extensionMarkers: readonly Types.Extensions.SyntheticExtensionMarker[];
    entryToNode: Map<Types.Events.Event, Helpers.TreeHelpers.TraceEntryNode>;
    syntheticConsoleEntriesForTimingsTrack: Types.Events.SyntheticConsoleTimeStamp[];
}
export declare function handleEvent(_event: Types.Events.Event): void;
export declare function reset(): void;
export declare function finalize(): Promise<void>;
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
export declare function extractConsoleAPIExtensionEntries(): void;
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
export declare function extractPerformanceAPIExtensionEntries(timings: Array<Types.Events.SyntheticUserTimingPair | Types.Events.PerformanceMark>): void;
/**
 * Parses out the data in a performance.measure / mark call into two parts:
 * 1. devtoolsObj: this is the data required to be passed by the user for the
 *    event to be used to create a custom track in the performance panel.
 * 2. userDetail: this is arbitrary data the user has attached to the event
 *    that we show in the summary drawer.
 */
export declare function extensionDataInPerformanceTiming(timing: Types.Events.SyntheticUserTimingPair | Types.Events.PerformanceMark): {
    devtoolsObj: Types.Extensions.DevToolsObj | null;
    userDetail: Types.Extensions.JsonValue | null;
};
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
export declare function extensionDataInConsoleTimeStamp(timeStamp: Types.Events.ConsoleTimeStamp): {
    devtoolsObj: Types.Extensions.DevToolsObjEntry | null;
    userDetail: Types.Extensions.JsonValue | null;
};
export declare function data(): ExtensionTraceData;
export declare function deps(): HandlerName[];
