import * as Common from '../common/common.js';
import type { HeapProfilerModel } from './HeapProfilerModel.js';
import { RuntimeModel } from './RuntimeModel.js';
import { type SDKModelObserver, TargetManager } from './TargetManager.js';
export declare class IsolateManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDKModelObserver<RuntimeModel> {
    #private;
    constructor(targetManager?: TargetManager);
    static instance(opts?: {
        forceNew: boolean;
        targetManager?: TargetManager;
    }): IsolateManager;
    observeIsolates(observer: Observer): void;
    modelAdded(model: RuntimeModel): void;
    modelRemoved(model: RuntimeModel): void;
    isolateByModel(model: RuntimeModel): Isolate | null;
    isolates(): Iterable<Isolate>;
    private poll;
}
export interface Observer {
    isolateAdded(isolate: Isolate): void;
    isolateRemoved(isolate: Isolate): void;
    isolateChanged(isolate: Isolate): void;
}
export declare const enum Events {
    MEMORY_CHANGED = "MemoryChanged"
}
export interface EventTypes {
    [Events.MEMORY_CHANGED]: Isolate;
}
export declare const MemoryTrendWindowMs = 120000;
export declare class Isolate {
    #private;
    constructor(id: string, manager: IsolateManager);
    id(): string;
    models(): Set<RuntimeModel>;
    runtimeModel(): RuntimeModel | null;
    heapProfilerModel(): HeapProfilerModel | null;
    update(): Promise<void>;
    samplesCount(): number;
    usedHeapSize(): number;
    /**
     * bytes per millisecond
     */
    usedHeapSizeGrowRate(): number;
}
export declare class MemoryTrend {
    #private;
    constructor(maxCount: number);
    reset(): void;
    count(): number;
    add(heapSize: number, timestamp?: number): void;
    fitSlope(): number;
}
