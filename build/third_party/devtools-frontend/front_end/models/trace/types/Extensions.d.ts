import type * as Platform from '../../../core/platform/platform.js';
import type { ConsoleTimeStamp, Event, PerformanceMark, PerformanceMeasureBegin, Phase, SyntheticBased } from './TraceEvents.js';
export type ExtensionEntryType = 'track-entry' | 'marker';
export declare const extensionPalette: readonly ['primary', 'primary-light', 'primary-dark', 'secondary', 'secondary-light', 'secondary-dark', 'tertiary', 'tertiary-light', 'tertiary-dark', 'error', 'warning'];
export type ExtensionColorFromPalette = typeof extensionPalette[number];
/**
 * Represents any valid value that can be produced by JSON.parse()
 * without a reviver.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface DevToolsObjBase {
    color?: ExtensionColorFromPalette;
    /**
     * We document to users that we support only string values here, but because
     * this is coming from user code the values could be anything, so we ensure we
     * deal with bad data by typing this as unknown.
     */
    properties?: Array<[string, JsonValue]>;
    tooltipText?: string;
}
export type DevToolsObj = DevToolsObjEntry | DevToolsObjMarker;
export interface ExtensionTrackEntryPayloadDeeplink {
    url: Platform.DevToolsPath.UrlString;
    description: string;
}
export interface DevToolsObjEntry extends DevToolsObjBase {
    dataType?: 'track-entry';
    track: string;
    trackGroup?: string;
    userDetail?: JsonValue;
}
export interface DevToolsObjMarker extends DevToolsObjBase {
    dataType: 'marker';
}
/**
 * Synthetic events created for extension tracks.
 */
export interface SyntheticExtensionTrackEntry extends SyntheticBased<Phase.COMPLETE, PerformanceMeasureBegin | PerformanceMark | ConsoleTimeStamp> {
    devtoolsObj: DevToolsObjEntry;
    userDetail: JsonValue | null;
}
/**
 * Synthetic events created for extension marks.
 */
export interface SyntheticExtensionMarker extends SyntheticBased<Phase.INSTANT, PerformanceMark> {
    devtoolsObj: DevToolsObjMarker;
    userDetail: JsonValue | null;
}
export type SyntheticExtensionEntry = SyntheticExtensionTrackEntry | SyntheticExtensionMarker;
/** Returns true if this is a devtoolsObj for a marker */
export declare function isExtensionPayloadMarker(payload: {
    dataType?: string;
}): payload is DevToolsObjMarker;
/** Returns true if this is a devtoolsObj for an entry (non-instant) */
export declare function isExtensionEntryObj(payload: {
    track?: string;
    dataType?: string;
}): payload is DevToolsObjEntry;
/** Returns true if this is a devtoolsObj for a console.timeStamp */
export declare function isConsoleTimestampPayloadTrackEntry(payload: {
    description?: string;
    url?: string;
}): payload is ExtensionTrackEntryPayloadDeeplink;
export declare function isValidExtensionPayload(payload: {
    track?: string;
    dataType?: string;
    description?: string;
    url?: string;
}): payload is DevToolsObj | ExtensionTrackEntryPayloadDeeplink;
export declare function isSyntheticExtensionEntry(entry: Event): entry is SyntheticExtensionEntry;
export interface ExtensionTrackData {
    name: string;
    isTrackGroup: boolean;
    entriesByTrack: Record<string, SyntheticExtensionTrackEntry[]>;
}
