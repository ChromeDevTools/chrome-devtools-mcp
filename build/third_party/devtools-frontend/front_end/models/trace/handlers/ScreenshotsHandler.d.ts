import * as Types from '../types/types.js';
import type { HandlerName } from './types.js';
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function screenshotImageDataUri(event: Types.Events.LegacySyntheticScreenshot | Types.Events.Screenshot): string;
export interface Data {
    legacySyntheticScreenshots: Types.Events.LegacySyntheticScreenshot[] | null;
    screenshots: Types.Events.Screenshot[] | null;
}
export declare function data(): Data;
export declare function deps(): HandlerName[];
