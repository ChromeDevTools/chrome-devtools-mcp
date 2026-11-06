import * as Types from '../types/types.js';
export declare function reset(): void;
/**
 * IMPORTANT: Before adding support for new initiator relationships in
 * trace events consider using Perfetto's flow API on the events in
 * question, so that they get automatically computed.
 * @see {@link flowsHandlerData}
 *
 * The events manually computed here were added before we had support
 * for flow events. As such they should be migrated to use the flow
 * API so that no manual parsing is needed.
 */
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export interface InitiatorsData {
    eventToInitiator: WeakMap<Types.Events.Event, Types.Events.Event>;
    initiatorToEvents: WeakMap<Types.Events.Event, Types.Events.Event[]>;
}
export declare function data(): InitiatorsData;
export declare function deps(): ['Flows', 'AsyncJSCalls'];
