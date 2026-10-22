import type * as Protocol from '../../../generated/protocol.js';
import type * as CPUProfile from '../../cpu_profile/cpu_profile.js';
import * as Types from '../types/types.js';
export declare function getEventDataObject(event: Types.Events.Event): Record<string, unknown> | null;
/**
 * Extracts the raw stack trace in known trace events. Most likely than
 * not you want to use `getZeroIndexedStackTraceForEvent`, which returns
 * the stack with zero based numbering. Since some trace events are
 * one based this function can yield unexpected results when used
 * indiscriminately.
 *
 * Note: this only returns the stack trace contained in the payload of
 * an event, which only contains the synchronous portion of the call
 * stack. If you want to obtain the whole stack trace you might need to
 * use the @see Trace.Extras.StackTraceForEvent util.
 */
export declare function stackTraceInEvent(event: Types.Events.Event): Types.Events.CallFrame[] | null;
export declare function extractOriginFromTrace(firstNavigationURL: string): string | null;
export type EventsInThread<T extends Types.Events.Event> = Map<Types.Events.ThreadID, T[]>;
/**
 * Each thread contains events. Events indicate the thread and process IDs, which are
 * used to store the event in the correct process thread entry below.
 **/
export declare function addEventToProcessThread<T extends Types.Events.Event>(event: T, eventsInProcessThread: Map<Types.Events.ProcessID, EventsInThread<T>>): void;
export declare function compareBeginAndEnd(aBeginTime: number, bBeginTime: number, aEndTime: number, bEndTime: number): -1 | 0 | 1;
export declare function eventTimeComparator(a: Types.Events.Event, b: Types.Events.Event): -1 | 0 | 1;
/**
 * Sorts all the events in place, in order, by their start time. If they have
 * the same start time, orders them by longest first.
 */
export declare function sortTraceEventsInPlace(events: Types.Events.Event[]): void;
/**
 * Returns an array of ordered events that results after merging the two
 * ordered input arrays.
 */
export declare function mergeEventsInOrder<T1 extends Types.Events.Event, T2 extends Types.Events.Event>(eventsArray1: readonly T1[], eventsArray2: readonly T2[]): Array<T1 | T2>;
export declare function parseDevtoolsDetails(timingDetail: string, key: string): Types.Extensions.DevToolsObj | Types.Extensions.ExtensionTrackEntryPayloadDeeplink | null;
export declare function getNavigationForTraceEvent(event: Types.Events.Event, eventFrameId: string, navigationsByFrameId: Map<string, Types.Events.NavigationStart[]>): Types.Events.NavigationStart | null;
export declare function extractId(event: Types.Events.PairableAsync | Types.Events.SyntheticEventPair<Types.Events.PairableAsync>): string | undefined;
export declare function activeURLForFrameAtTime(frameId: string, time: Types.Timing.Micro, rendererProcessesByFrame: Map<string, Map<Types.Events.ProcessID, Array<{
    frame: Types.Events.TraceFrame;
    window: Types.Timing.TraceWindowMicro;
}>>>): string | null;
/**
 * @param node the node attached to the profile call. Here a node represents a function in the call tree.
 * @param profileId the profile ID that the sample came from that backs this call.
 * @param sampleIndex the index of the sample in the given profile that this call was created from
 * @param ts the timestamp of the profile call
 * @param pid the process ID of the profile call
 * @param tid the thread ID of the profile call
 *
 * See `panels/timeline/docs/profile_calls.md` for more context on how these events are created.
 */
export declare function makeProfileCall(node: CPUProfile.ProfileTreeModel.ProfileNode, profileId: Types.Events.ProfileID, sampleIndex: number, ts: Types.Timing.Micro, pid: Types.Events.ProcessID, tid: Types.Events.ThreadID): Types.Events.SyntheticProfileCall;
export declare function getSyntheticId(event: Types.Events.PairableAsync): string | undefined;
/**
 * Groups up sets of async events into synthetic events.
 * @param unpairedAsyncEvents the raw array of begin, end and async instant
 * events. These MUST be sorted in timestamp ASC order.
 */
export declare function createMatchedSortedSyntheticEvents<T extends Types.Events.PairableAsync>(unpairedAsyncEvents: T[]): Array<Types.Events.SyntheticEventPair<T>>;
/**
 * Different trace events return line/column numbers that are 1 or 0 indexed.
 * This function knows which events return 1 indexed numbers and normalizes
 * them. The UI expects 0 indexed line numbers, so that is what we return.
 */
export declare function getZeroIndexedLineAndColumnForEvent(event: Types.Events.Event): {
    lineNumber?: number;
    columnNumber?: number;
};
/**
 * Different trace events contain stack traces with line/column numbers
 * that are 1 or 0 indexed.
 * This function knows which events return 1 indexed numbers and normalizes
 * them. The UI expects 0 indexed line numbers, so that is what we return.
 *
 * Note: this only returns the stack trace contained in the payload of
 * an event, which only contains the synchronous portion of the call
 * stack. If you want to obtain the whole stack trace you might need to
 * use the @see Trace.Extras.StackTraceForEvent util.
 */
export declare function getZeroIndexedStackTraceInEventPayload(event: Types.Events.Event): Types.Events.CallFrame[] | null;
/**
 * Same as getZeroIndexedStackTraceInEventPayload, but only returns the top call frame.
 */
export declare function getStackTraceTopCallFrameInEventPayload(event: Types.Events.Event): Types.Events.CallFrame | null;
export declare function rawCallFrameForEntry(entry: Types.Events.Event): Protocol.Runtime.CallFrame | null;
/**
 * Given a 1-based call frame creates a 0-based one.
 */
export declare function makeZeroBasedCallFrame(callFrame: Types.Events.CallFrame): Types.Events.CallFrame;
export declare function frameIDForEvent(event: Types.Events.Event): string | null;
export declare function navigationIDForEvent(event?: Types.Events.Event): string | undefined;
export declare function isTopLevelEvent(event: Types.Events.Event): boolean;
export declare function isExtensionUrl(url: string): boolean;
export declare function findRecalcStyleEvents(events: Types.Events.Event[], startTime: Types.Timing.Micro, endTime?: Types.Timing.Micro): Types.Events.RecalcStyle[];
export declare function findNextEventAfterTimestamp<T extends Types.Events.Event>(candidates: T[], ts: Types.Timing.Micro): T | null;
export declare function findPreviousEventBeforeTimestamp<T extends Types.Events.Event>(candidates: T[], ts: Types.Timing.Micro): T | null;
export interface ForEachEventConfig {
    onStartEvent: (event: Types.Events.Event) => void;
    onEndEvent: (event: Types.Events.Event) => void;
    onInstantEvent?: (event: Types.Events.Event) => void;
    eventFilter?: (event: Types.Events.Event) => boolean;
    startTime?: Types.Timing.Micro;
    endTime?: Types.Timing.Micro;
    ignoreAsyncEvents?: boolean;
}
/**
 * Iterates events in a tree hierarchically, from top to bottom,
 * calling back on every event's start and end in the order
 * dictated by the corresponding timestamp.
 *
 * Events are assumed to be in ascendent order by timestamp.
 *
 * Events with 0 duration are treated as instant events. These do not have a
 * begin and end, but will be passed to the config.onInstantEvent callback as
 * they are discovered. Do not provide this callback if you are not interested
 * in them.
 *
 * For example, given this tree, the following callbacks
 * are expected to be made in the following order
 * |---------------A---------------|
 *  |------B------||-------D------|
 *    |---C---|
 *
 * 1. Start A
 * 3. Start B
 * 4. Start C
 * 5. End C
 * 6. End B
 * 7. Start D
 * 8. End D
 * 9. End A
 *
 * By default, async events are skipped. This behaviour can be
 * overridden making use of the config.ignoreAsyncEvents parameter.
 */
export declare function forEachEvent(events: Types.Events.Event[], config: ForEachEventConfig): void;
export declare function eventHasCategory(event: Types.Events.Event, category: string): boolean;
/**
 * This compares Types.Events.CallFrame with Protocol.Runtime.CallFrame and checks for equality.
 */
export declare function isMatchingCallFrame(eventFrame: Types.Events.CallFrame, nodeFrame: Protocol.Runtime.CallFrame): boolean;
export declare function eventContainsTimestamp(event: Types.Events.Event, ts: Types.Timing.Micro): boolean;
export declare function extractSampleTraceId(event: Types.Events.Event): number | null;
/**
 * This exactly matches Trace.Styles.visibleTypes. See the runtime verification in maybeInitStylesMap.
 * TODO(crbug.com/410884528)
 **/
export declare const VISIBLE_TRACE_EVENT_TYPES: Set<Types.Events.Name>;
