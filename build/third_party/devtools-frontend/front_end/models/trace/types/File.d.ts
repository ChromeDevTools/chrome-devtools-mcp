import type * as SDK from '../../../core/sdk/sdk.js';
import type * as Protocol from '../../../generated/protocol.js';
import type * as CrUXManager from '../../../models/crux-manager/crux-manager.js';
import type { TraceWindowMicro } from './Timing.js';
import type { Event, LegacyTimelineFrame, ProcessID, SampleIndex, ThreadID } from './TraceEvents.js';
export interface TraceFile {
    traceEvents: readonly Event[];
    metadata: MetaData;
}
interface TraceFileWithUnknownMetadata {
    traceEvents: readonly Event[];
    metadata?: MetaData;
}
export interface Breadcrumb {
    window: TraceWindowMicro;
    child: Breadcrumb | null;
}
export declare enum DataOrigin {
    CPU_PROFILE = "CPUProfile",
    TRACE_EVENTS = "TraceEvents"
}
/**
 * The Entries link can have 3 stated:
 *  1. The Link creation is not started yet, meaning only the button that needs to be clicked to start creating the link is visible.
 *  2. Pending to event - the creation is started, but the entry that the link points to has not been chosen yet
 *  3. Link connected - final state, both entries present
 */
export declare enum EntriesLinkState {
    CREATION_NOT_STARTED = "creation_not_started",
    PENDING_TO_EVENT = "pending_to_event",
    CONNECTED = "connected"
}
export declare enum EventKeyType {
    RAW_EVENT = "r",
    SYNTHETIC_EVENT = "s",
    PROFILE_CALL = "p",
    LEGACY_TIMELINE_FRAME = "l",
    LAYOUT_SHIFT_CLUSTER = "c"
}
/**
 * Represents an object that is saved in the file when user created annotations in the timeline.
 *
 * Expected to add more annotations.
 */
export interface SerializedAnnotations {
    entryLabels: EntryLabelAnnotationSerialized[];
    labelledTimeRanges: TimeRangeAnnotationSerialized[];
    linksBetweenEntries: EntriesLinkAnnotationSerialized[];
}
/**
 * Represents an object that is used to store the Entry Label annotation that is created when a user creates a label for an entry in the timeline.
 */
export interface EntryLabelAnnotation {
    type: 'ENTRY_LABEL';
    entry: Event | LegacyTimelineFrame;
    label: string;
}
/**
 * Represents an object that is used to store the Labelled Time Range Annotation that is created when a user creates a Time Range Selection in the timeline.
 */
export interface TimeRangeAnnotation {
    type: 'TIME_RANGE';
    label: string;
    bounds: TraceWindowMicro;
}
export interface EntriesLinkAnnotation {
    type: 'ENTRIES_LINK';
    state: EntriesLinkState;
    entryFrom: Event;
    entryTo?: Event;
}
/**
 * Represents an object that is saved in the file when a user creates a label for an entry in the timeline.
 */
export interface EntryLabelAnnotationSerialized {
    entry: SerializableKey;
    label: string;
}
/**
 * Represents an object that is saved in the file when a user creates a time range with a label in the timeline.
 */
export interface TimeRangeAnnotationSerialized {
    bounds: TraceWindowMicro;
    label: string;
}
/**
 * Represents an object that is saved in the file when a user creates a link between entries in the timeline.
 */
export interface EntriesLinkAnnotationSerialized {
    entryFrom: SerializableKey;
    entryTo: SerializableKey;
}
/**
 * `Annotation` are the user-created annotations that are saved into the metadata.
 * Those annotations are rendered on the timeline by `Overlays.ts`
 *
 * TODO: Implement other OverlayAnnotations (annotated time ranges, links between entries).
 * TODO: Save/load overlay annotations to/from the trace file.
 */
export type Annotation = EntryLabelAnnotation | TimeRangeAnnotation | EntriesLinkAnnotation;
export declare function isTimeRangeAnnotation(annotation: Annotation): annotation is TimeRangeAnnotation;
export declare function isEntryLabelAnnotation(annotation: Annotation): annotation is EntryLabelAnnotation;
export declare function isEntriesLinkAnnotation(annotation: Annotation): annotation is EntriesLinkAnnotation;
/**
 * Serializable keys are created for trace events to be able to save
 * references to timeline events in a trace file. These keys enable
 * user modifications that can be saved. See go/cpq:event-data-json for
 * more details on the key format.
 **/
export type RawEventKey = `${EventKeyType.RAW_EVENT}-${number}`;
export type SyntheticEventKey = `${EventKeyType.SYNTHETIC_EVENT}-${number}`;
export type ProfileCallKey = `${EventKeyType.PROFILE_CALL}-${ProcessID}-${ThreadID}-${SampleIndex}-${Protocol.integer}`;
export type LegacyTimelineFrameKey = `${EventKeyType.LEGACY_TIMELINE_FRAME}-${number}`;
export type LayoutShiftClusterKey = `${EventKeyType.LAYOUT_SHIFT_CLUSTER}-${number}`;
export type SerializableKey = RawEventKey | ProfileCallKey | SyntheticEventKey | LegacyTimelineFrameKey | LayoutShiftClusterKey;
/** Serializable keys values objects contain data that maps the keys to original Trace Events **/
export interface RawEventKeyValues {
    type: EventKeyType.RAW_EVENT;
    rawIndex: number;
}
export interface SyntheticEventKeyValues {
    type: EventKeyType.SYNTHETIC_EVENT;
    rawIndex: number;
}
export interface ProfileCallKeyValues {
    type: EventKeyType.PROFILE_CALL;
    processID: ProcessID;
    threadID: ThreadID;
    sampleIndex: SampleIndex;
    protocol: Protocol.integer;
}
export interface LegacyTimelineFrameKeyValues {
    type: EventKeyType.LEGACY_TIMELINE_FRAME;
    rawIndex: number;
}
export interface LayoutShiftClusterKeyValues {
    type: EventKeyType.LAYOUT_SHIFT_CLUSTER;
    rawIndex: number;
}
export type SerializableKeyValues = RawEventKeyValues | ProfileCallKeyValues | SyntheticEventKeyValues | LegacyTimelineFrameKeyValues | LayoutShiftClusterKeyValues;
export interface Modifications {
    entriesModifications: {
        hiddenEntries: SerializableKey[];
        expandableEntries: SerializableKey[];
    };
    initialBreadcrumb: Breadcrumb;
    annotations: SerializedAnnotations;
}
/**
 * IMPORTANT: this is the same as PerfUI.FlameChart.PersistedGroupConfig
 * However, the PerfUI code should not depend on the model/trace, and similarly
 * this model cannot depend on that code, so we duplicate it.
 **/
export interface TrackVisualConfig {
    hidden: boolean;
    expanded: boolean;
    originalIndex: number;
    visualIndex: number;
    trackName: string;
}
/**
 * Stores the visual config if the user has modified it. Split into "main" and
 * "network" so we can pass the relevant config into the right data provider.
 * NOTE: as of August 2025 (M141) we currently do not export this in new
 * traces, or use it if an existing trace is imported with it.
 */
export interface PersistedTraceVisualConfig {
    main: TrackVisualConfig[] | null;
    network: TrackVisualConfig[] | null;
}
/**
 * Trace metadata that we persist to the file. This will allow us to
 * store specifics for the trace, e.g., which tracks should be visible
 * on load.
 */
export interface MetaData {
    title?: string;
    source?: 'DevTools';
    startTime?: string;
    emulatedDeviceTitle?: string;
    networkThrottling?: string;
    networkThrottlingConditions?: Omit<SDK.NetworkManager.Conditions, 'title'>;
    cpuThrottling?: number;
    dataOrigin?: DataOrigin;
    enhancedTraceVersion?: number;
    modifications?: Modifications;
    cruxFieldData?: CrUXManager.PageResult[];
    /** Currently only stores JS maps, not CSS. This never stores data url source maps. */
    sourceMaps?: MetadataSourceMap[];
    /** Currently only stores HTML and CSS resources. */
    resources?: MetadataResource[];
    visualTrackConfig?: PersistedTraceVisualConfig;
    hostDPR?: number;
}
export interface MetadataSourceMap {
    url: string;
    /** If not defined, then this was a data url. */
    sourceMapUrl?: string;
    sourceMap: SDK.SourceMap.SourceMapV3;
}
export interface MetadataResource {
    url: string;
    frame: string;
    content: string;
    mimeType: string;
}
export type Contents = TraceFileWithUnknownMetadata | Event[];
export declare function traceEventKeyToValues(key: SerializableKey): SerializableKeyValues;
export {};
