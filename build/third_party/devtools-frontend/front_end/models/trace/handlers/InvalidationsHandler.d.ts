import * as Types from '../types/types.js';
export declare function reset(): void;
export declare function handleUserConfig(userConfig: Types.Configuration.Configuration): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
interface InvalidationsData {
    invalidationsForEvent: Map<Types.Events.Event, Types.Events.InvalidationTrackingEvent[]>;
    invalidationCountForEvent: Map<Types.Events.Event, number>;
}
export declare function data(): InvalidationsData;
export {};
