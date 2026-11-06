import type * as Platform from '../../core/platform/platform.js';
import * as HeapSnapshotModel from '../../models/heap_snapshot/heap_snapshot.js';
export declare class HeapSnapshotWorkerDispatcher {
    #private;
    constructor(postMessage: Platform.HostRuntime.Worker['postMessage']);
    sendEvent(name: string, data: unknown): void;
    dispatchMessage({ data, ports, }: Platform.HostRuntime.WorkerMessageEvent<HeapSnapshotModel.HeapSnapshotModel.WorkerCommand>): Promise<void>;
}
