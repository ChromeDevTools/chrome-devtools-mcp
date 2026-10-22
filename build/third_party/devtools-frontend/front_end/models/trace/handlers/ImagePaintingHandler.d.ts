import * as Types from '../types/types.js';
import type { FinalizeOptions } from './types.js';
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(options: FinalizeOptions): Promise<void>;
export interface ImagePaintData {
    paintImageByDrawLazyPixelRef: Map<number, Types.Events.PaintImage>;
    paintImageForEvent: WeakMap<Types.Events.Event, Types.Events.PaintImage>;
    paintImageEventForUrl: Map<string, Types.Events.PaintImage[]>;
    paintEventToCorrectedDisplaySize: WeakMap<Types.Events.PaintImage, {
        width: number;
        height: number;
    }>;
    /** Go read the comment in finalize(). */
    didCorrectForHostDpr: boolean;
}
export declare function data(): ImagePaintData;
