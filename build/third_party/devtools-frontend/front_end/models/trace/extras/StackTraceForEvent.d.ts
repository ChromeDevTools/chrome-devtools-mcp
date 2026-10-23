import type * as Protocol from '../../../generated/protocol.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
export declare const stackTraceForEventInTrace: WeakMap<Handlers.Types.HandlerData, Map<Types.Events.Event, Protocol.Runtime.StackTrace>>;
export declare function clearCacheForTrace(data: Handlers.Types.HandlerData): void;
/**
 * This util builds a stack trace that includes async calls for a given
 * event. It leverages data we collect from sampling to deduce sync
 * stacks and trace event instrumentation on the V8 debugger to stitch
 * them together.
 */
export declare function get(event: Types.Events.Event, data: Handlers.Types.HandlerData): Protocol.Runtime.StackTrace | null;
