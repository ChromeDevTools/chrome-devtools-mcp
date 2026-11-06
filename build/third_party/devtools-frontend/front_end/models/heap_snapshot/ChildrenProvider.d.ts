import type { ComparatorConfig, ItemsRange } from './HeapSnapshotModel.js';
export interface ChildrenProvider {
    dispose(): void;
    nodePosition(snapshotObjectId: number): Promise<number>;
    isEmpty(): Promise<boolean>;
    serializeItemsRange(startPosition: number, endPosition: number): Promise<ItemsRange>;
    sortAndRewind(comparator: ComparatorConfig): Promise<void>;
}
