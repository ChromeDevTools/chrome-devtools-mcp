import * as Types from '../types/types.js';
import type { HandlerName } from './types.js';
export interface Data {
    animationFrames: Types.Events.SyntheticAnimationFramePair[];
    presentationForFrame: WeakMap<Types.Events.SyntheticAnimationFramePair, Types.Events.AnimationFramePresentation>;
}
export declare function reset(): void;
export declare function handleUserConfig(config: Types.Configuration.Configuration): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): Data;
export declare function deps(): HandlerName[];
