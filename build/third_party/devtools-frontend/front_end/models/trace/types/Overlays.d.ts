import type { EntriesLinkState } from './File.js';
import type { Micro, TraceWindowMicro } from './Timing.js';
import type { Event, LegacyTimelineFrame, PageLoadEvent } from './TraceEvents.js';
/**
 * Represents which flamechart an entry is rendered in.
 * We need to know this because when we place an overlay for an entry we need
 * to adjust its Y value if it's in the main chart which is drawn below the
 * network chart
 */
export type EntryChartLocation = 'main' | 'network';
/**
 * You can add overlays to trace events, but also right now frames are drawn on
 * the timeline but they are not trace events, so we need to allow for that.
 * In the future when the frames track has been migrated to be powered by
 * animation frames (crbug.com/345144583), we can remove the requirement to
 * support TimelineFrame instances (which themselves will be removed from the
 * codebase.)
 */
export type OverlayEntry = Event | LegacyTimelineFrame;
/**
 * Represents when a user has selected an entry in the timeline
 */
export interface EntrySelected {
    type: 'ENTRY_SELECTED';
    entry: OverlayEntry;
}
/**
 * Drawn around an entry when we want to highlight it to the user.
 */
export interface EntryOutline {
    type: 'ENTRY_OUTLINE';
    entry: OverlayEntry;
    outlineReason: 'ERROR' | 'INFO';
}
/**
 * Represents an object created when a user creates a label for an entry in the timeline.
 */
export interface EntryLabel {
    type: 'ENTRY_LABEL';
    entry: OverlayEntry;
    label: string;
}
export interface EntriesLink {
    type: 'ENTRIES_LINK';
    state: EntriesLinkState;
    entryFrom: OverlayEntry;
    entryTo?: OverlayEntry;
}
/**
 * Represents a time range on the trace. Also used when the user shift+clicks
 * and drags to create a time range.
 */
export interface TimeRangeLabel {
    type: 'TIME_RANGE';
    bounds: TraceWindowMicro;
    label: string;
    showDuration: boolean;
}
/**
 * Used to highlight with a red-candy stripe a time range. It takes an entry
 * because this entry is the row that will be used to place the candy stripe,
 * and its height will be set to the height of that row.
 */
export interface CandyStripedTimeRange {
    type: 'CANDY_STRIPED_TIME_RANGE';
    bounds: TraceWindowMicro;
    entry: Event;
}
/**
 * An EntryBreakdown, or section, that makes up a TimespanBreakdown.
 */
export interface TimespanBreakdownEntryBreakdown {
    bounds: TraceWindowMicro;
    label: string | object;
    showDuration: boolean;
}
/**
 * Represents a timespan on a trace broken down into parts. Each part has a label to it.
 * If an entry is defined, the breakdown will be vertically positioned based on it.
 */
export interface TimespanBreakdown {
    type: 'TIMESPAN_BREAKDOWN';
    sections: TimespanBreakdownEntryBreakdown[];
    entry?: Event;
    renderLocation?: 'BOTTOM_OF_TIMELINE' | 'BELOW_EVENT' | 'ABOVE_EVENT';
}
export interface TimestampMarker {
    type: 'TIMESTAMP_MARKER';
    timestamp: Micro;
}
/**
 * Represents a timings marker. This has a line that runs up the whole canvas.
 * We can hold an array of entries, in the case we want to hold more than one with the same timestamp.
 * The adjusted timestamp being the timestamp for the event adjusted by closest navigation.
 */
export interface TimingsMarker {
    type: 'TIMINGS_MARKER';
    entries: PageLoadEvent[];
    entryToFieldResult: Map<PageLoadEvent, TimingsMarkerFieldResult>;
    adjustedTimestamp: Micro;
}
export interface TimingsMarkerFieldResult {
    value: Micro;
    pageScope: 'url' | 'origin';
}
export interface BottomInfoBar {
    type: 'BOTTOM_INFO_BAR';
    infobar: {
        element: object;
        dispose: () => void;
    };
}
/**
 * Marks a flame chart entry that has a comment thread, linked by ID to a
 * CommentThread in CommentManager. The overlay renders an invisible box sized
 * to the entry. The shared comments overlay draws the pin, highlight and popup
 * relative to that box.
 */
export interface CommentPin {
    type: 'COMMENT_PIN';
    entry: OverlayEntry;
    commentThreadId: string;
}
/**
 * All supported overlay types.
 */
export type Overlay = EntrySelected | EntryOutline | TimeRangeLabel | EntryLabel | EntriesLink | TimespanBreakdown | TimestampMarker | CandyStripedTimeRange | TimingsMarker | BottomInfoBar | CommentPin;
