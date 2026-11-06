import * as Types from '../types/types.js';
import type { HandlerName } from './types.js';
export interface WarningsData {
    perEvent: WeakMap<Types.Events.Event, Warning[]>;
    perWarning: Map<Warning, Types.Events.Event[]>;
}
export type Warning = 'LONG_TASK' | 'IDLE_CALLBACK_OVER_TIME' | 'FORCED_REFLOW' | 'LONG_INTERACTION';
export declare const FORCED_REFLOW_THRESHOLD: Types.Timing.Micro;
export declare const LONG_MAIN_THREAD_TASK_THRESHOLD: Types.Timing.Micro;
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function deps(): HandlerName[];
export declare function finalize(): Promise<void>;
export declare function data(): WarningsData;
