import * as Types from '../types/types.js';
export interface MemoryData {
    updateCountersByProcess: Map<Types.Events.ProcessID, Types.Events.UpdateCounters[]>;
}
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): MemoryData;
