import type * as Types from '../types/types.js';
import { type TraceEntryNode } from './TreeHelpers.js';
export declare function buildTrackDataFromExtensionEntries(extensionEntries: Types.Extensions.SyntheticExtensionTrackEntry[], extensionTrackData: Types.Extensions.ExtensionTrackData[], entryToNode: Map<Types.Events.Event, TraceEntryNode>): {
    extensionTrackData: Types.Extensions.ExtensionTrackData[];
    entryToNode?: Map<Types.Events.Event, TraceEntryNode>;
};
