import type { ParsedTrace } from './ModelImpl.js';
import * as Types from './types/types.js';
/**
 * Calculates the display name for a given entry.
 * @param parsedTrace If the trace data is provided
 * as the second argument it can be used to find source map resolved names for
 * profile calls.
 * Use this function to customize the user visible name for an entry. If no
 * custom name is found, we will fallback to the `name` property in the trace
 * entry.
 */
export declare function forEntry(entry: Types.Events.Event, parsedTrace?: ParsedTrace): string;
