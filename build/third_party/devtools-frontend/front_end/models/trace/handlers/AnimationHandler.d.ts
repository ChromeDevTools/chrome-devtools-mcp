import * as Types from '../types/types.js';
export interface AnimationData {
    animations: readonly Types.Events.SyntheticAnimationPair[];
}
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): AnimationData;
