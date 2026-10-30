import type { ParsedTrace } from './ModelImpl.js';
import * as Types from './types/types.js';
export declare class EventsSerializer {
    #private;
    keyForEvent(event: Types.Events.Event): Types.File.SerializableKey | null;
    eventForKey(key: Types.File.SerializableKey, parsedTrace: ParsedTrace): Types.Events.Event;
    static isProfileCallKey(key: Types.File.SerializableKeyValues): key is Types.File.ProfileCallKeyValues;
    static isLegacyTimelineFrameKey(key: Types.File.SerializableKeyValues): key is Types.File.LegacyTimelineFrameKeyValues;
    static isLayoutShiftClusterKey(key: Types.File.SerializableKeyValues): key is Types.File.LayoutShiftClusterKeyValues;
    static isRawEventKey(key: Types.File.SerializableKeyValues): key is Types.File.RawEventKeyValues;
    static isSyntheticEventKey(key: Types.File.SerializableKeyValues): key is Types.File.SyntheticEventKeyValues;
}
