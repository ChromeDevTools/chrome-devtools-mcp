import * as Types from '../types/types.js';
import type { HandlerName } from './types.js';
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export interface LayerTreeData {
    paints: Types.Events.Paint[];
    snapshots: Types.Events.DisplayItemListSnapshot[];
    paintsToSnapshots: WeakMap<Types.Events.Paint, Types.Events.DisplayItemListSnapshot>;
}
export declare function data(): LayerTreeData;
export declare function deps(): HandlerName[];
