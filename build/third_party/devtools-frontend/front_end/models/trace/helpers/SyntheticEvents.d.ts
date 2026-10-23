import type * as Types from '../types/types.js';
export declare class SyntheticEventsManager {
    #private;
    static activate(manager: SyntheticEventsManager): void;
    static createAndActivate(rawEvents: readonly Types.Events.Event[]): SyntheticEventsManager;
    static getActiveManager(): SyntheticEventsManager;
    static reset(): void;
    static registerSyntheticEvent<T extends Types.Events.SyntheticBased>(syntheticEvent: Omit<T, '_tag'>): T;
    private constructor();
    /**
     * Clears the transient raw event index map.
     * During trace parsing, this map provides O(1) lookups for registering synthetic events.
     * Once parsing is complete, queries look up synthetic events exclusively by index in
     * `#syntheticTraces`, so this map is discarded to reclaim memory.
     */
    clearRegistrationIndex(): void;
    syntheticEventForRawEventIndex(rawEventIndex: number): Types.Events.SyntheticBased;
    getSyntheticTraces(): Types.Events.SyntheticBased[];
    getRawTraceEvents(): readonly Types.Events.Event[];
}
