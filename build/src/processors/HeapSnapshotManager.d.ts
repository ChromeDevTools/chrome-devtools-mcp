/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools } from '../third_party/index.js';
import type { TaskRunner } from '../utils/TaskRunner.js';
export interface HeapSnapshotAggregate {
    id: number;
    className: string;
    count: number;
    selfSize: number;
    retainedSize: number;
}
export interface HeapSnapshotAggregateData {
    aggregates: HeapSnapshotAggregate[];
    objectCount: number;
    totalSelfSize: number;
}
export interface HeapSnapshotDiff {
    classDiffs: HeapSnapshotClassDiff[];
    totals: HeapSnapshotClassDiffTotals;
}
export interface HeapSnapshotClassDiff {
    /** Position in the full sorted diff list. Use as `classIndex`. */
    index: number;
    className: string;
    addedCount: number;
    removedCount: number;
    countDelta: number;
    addedSize: number;
    removedSize: number;
    sizeDelta: number;
}
export interface HeapSnapshotDetailedClassDiff {
    classDiff: HeapSnapshotClassDiff;
    objects: readonly HeapSnapshotDiffObject[];
}
export interface HeapSnapshotDiffObject {
    id: number;
    selfSize: number;
    change: 'added' | 'deleted';
}
export interface HeapSnapshotClassDiffTotals {
    addedCount: number;
    removedCount: number;
    countDelta: number;
    addedSize: number;
    removedSize: number;
    sizeDelta: number;
}
export type DuplicateStringGroup = DevTools.HeapSnapshotModel.HeapSnapshotModel.DuplicateStringGroup;
export type HeapQueryOptions = DevTools.HeapSnapshotModel.HeapSnapshotModel.HeapQueryOptions;
export type HeapEdgesQueryOptions = DevTools.HeapSnapshotModel.HeapSnapshotModel.HeapEdgesQueryOptions;
export declare class HeapSnapshot {
    #private;
    proxy: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy;
    worker: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy;
    constructor(proxy: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy, worker: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy, aggregates: Record<string, DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo>);
    resolveIdFromClassKey(classKey: string): number | undefined;
    resolveClassKeyFromId(id: number): string | undefined;
}
export declare class HeapSnapshotManager {
    #private;
    constructor(taskRunner: TaskRunner);
    getSnapshot(filePath: string): Promise<HeapSnapshot>;
    getAggregates(filePath: string, filterName?: string, objectId?: number): Promise<HeapSnapshotAggregateData>;
    getStats(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics>;
    getStaticData(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null>;
    getNativeContextSizes(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes>;
    getRetainedByContextSummary(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary>;
    getNodesById(filePath: string, id: number, filterName?: string, objectId?: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    getRetainers(filePath: string, nodeId: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    getObjectInfo(filePath: string, nodeId: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo>;
    analyzeContexts(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult>;
    getRetainingPaths(filePath: string, nodeId: number, maxDepth?: number, maxNodes?: number, maxSiblings?: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths>;
    getDominatorsOf(filePath: string, nodeId: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain>;
    getEdges(filePath: string, nodeId: number, options?: HeapEdgesQueryOptions): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    getClassDiffs(baseFilePath: string, currentFilePath: string): Promise<HeapSnapshotDiff>;
    getDetailedClassDiff(baseFilePath: string, currentFilePath: string, classIndex: number): Promise<HeapSnapshotDetailedClassDiff>;
    getDuplicateStrings(filePath: string): Promise<DuplicateStringGroup[]>;
    queryObjects(filePath: string, options: HeapQueryOptions): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    hasSnapshots(): boolean;
    disposeSnapshot(filePath: string): Promise<boolean>;
    dispose(): void;
}
