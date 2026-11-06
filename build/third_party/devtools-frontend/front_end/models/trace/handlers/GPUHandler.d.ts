import * as Types from '../types/types.js';
import type { HandlerName } from './types.js';
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export interface GPUHandlerReturnData {
    mainGPUThreadTasks: readonly Types.Events.GPUTask[];
}
export declare function data(): GPUHandlerReturnData;
export declare function deps(): HandlerName[];
