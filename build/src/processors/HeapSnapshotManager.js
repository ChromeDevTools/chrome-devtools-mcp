/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fsSync from 'node:fs';
import path from 'node:path';
import { DevTools } from '../third_party/index.js';
import { createIdGenerator } from '../utils/id.js';
export class HeapSnapshot {
    proxy;
    worker;
    // 1-indexed array where index is the class ID.
    #idToClassKey = [''];
    #classKeyToId = new Map();
    constructor(proxy, worker, aggregates) {
        this.proxy = proxy;
        this.worker = worker;
        for (const key of Object.keys(aggregates)) {
            const id = this.#idToClassKey.length;
            this.#classKeyToId.set(key, id);
            this.#idToClassKey.push(key);
        }
    }
    resolveIdFromClassKey(classKey) {
        return this.#classKeyToId.get(classKey);
    }
    resolveClassKeyFromId(id) {
        return this.#idToClassKey[id];
    }
}
const VALID_EXTENSIONS = ['.heapsnapshot', '.heaptimeline'];
function hasValidHeapSnapshotExtension(filePath) {
    return VALID_EXTENSIONS.some(ext => filePath.endsWith(ext));
}
export class HeapSnapshotManager {
    #snapshotIdGenerator = createIdGenerator();
    #snapshots = new Map();
    async getSnapshot(filePath) {
        if (!hasValidHeapSnapshotExtension(filePath)) {
            throw new Error(`File ${filePath} must have a .heapsnapshot or .heaptimeline extension.`);
        }
        const absolutePath = path.resolve(filePath);
        let cached = this.#snapshots.get(absolutePath);
        if (!cached) {
            const uid = this.#snapshotIdGenerator();
            cached = this.#loadSnapshot(absolutePath, uid);
            this.#snapshots.set(absolutePath, cached);
        }
        return await cached;
    }
    async #applyNodeFilter(snapshot, filter, filterName, objectId) {
        if (filterName === 'attributedToSpecificNativeContext') {
            if (objectId === undefined) {
                throw new Error('objectId is required when filterName is attributedToSpecificNativeContext');
            }
            const nodeIndex = await snapshot.nodeIndexForId(objectId);
            if (nodeIndex === undefined) {
                throw new Error(`Node with ID ${objectId} not found`);
            }
            filter.filterName = `nativeContext_${nodeIndex}`;
        }
        else if (filterName) {
            filter.filterName = filterName;
        }
    }
    async getAggregates(filePath, filterName, objectId) {
        const snapshot = await this.getSnapshot(filePath);
        const filter = new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
        await this.#applyNodeFilter(snapshot.proxy, filter, filterName, objectId);
        const rawAggregates = await snapshot.proxy.aggregatesWithFilter(filter);
        let objectCount = 0;
        let totalSelfSize = 0;
        const aggregates = [];
        for (const [key, aggregate] of Object.entries(rawAggregates)) {
            const id = snapshot.resolveIdFromClassKey(key);
            if (id === undefined) {
                throw new Error(`No class ID found for class key ${key}`);
            }
            objectCount += aggregate.count;
            totalSelfSize += aggregate.self;
            aggregates.push({
                id,
                className: aggregate.name,
                count: aggregate.count,
                selfSize: aggregate.self,
                retainedSize: aggregate.maxRet,
            });
        }
        aggregates.sort((a, b) => b.retainedSize - a.retainedSize);
        return {
            aggregates,
            objectCount,
            totalSelfSize,
        };
    }
    async getStats(filePath) {
        const snapshot = await this.getSnapshot(filePath);
        return await snapshot.proxy.getStatistics();
    }
    async getStaticData(filePath) {
        const snapshot = await this.getSnapshot(filePath);
        return snapshot.proxy.staticData;
    }
    async getNativeContextSizes(filePath) {
        const snapshot = await this.getSnapshot(filePath);
        return await snapshot.proxy.getNativeContextSizes();
    }
    async getRetainedByContextSummary(filePath) {
        const snapshot = await this.getSnapshot(filePath);
        return await snapshot.proxy.getRetainedByContextSummary();
    }
    async getNodesById(filePath, id, filterName, objectId) {
        const snapshot = await this.getSnapshot(filePath);
        const filter = new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
        await this.#applyNodeFilter(snapshot.proxy, filter, filterName, objectId);
        const className = snapshot.resolveClassKeyFromId(id);
        if (!className) {
            throw new Error(`Class with ID ${id} not found in heap snapshot`);
        }
        const provider = snapshot.proxy.createNodesProviderForClass(className, filter);
        return await provider.serializeItemsRange(0, Infinity);
    }
    async getRetainers(filePath, nodeId) {
        const snapshot = await this.getSnapshot(filePath);
        const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
        if (nodeIndex === undefined) {
            throw new Error(`Node with ID ${nodeId} not found`);
        }
        const provider = snapshot.proxy.createRetainingEdgesProvider(nodeIndex);
        return await provider.serializeItemsRange(0, Infinity);
    }
    async getObjectInfo(filePath, nodeId) {
        const snapshot = await this.getSnapshot(filePath);
        const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
        if (nodeIndex === undefined) {
            throw new Error(`Node with ID ${nodeId} not found`);
        }
        return await snapshot.proxy.getObjectInfo(nodeIndex);
    }
    async analyzeContexts(filePath) {
        const snapshot = await this.getSnapshot(filePath);
        return await snapshot.proxy.analyzeContexts();
    }
    async getRetainingPaths(filePath, nodeId, maxDepth, maxNodes, maxSiblings) {
        const snapshot = await this.getSnapshot(filePath);
        const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
        if (nodeIndex === undefined) {
            throw new Error(`Node with ID ${nodeId} not found`);
        }
        return await snapshot.proxy.getRetainingPaths(nodeIndex, maxDepth, maxNodes, maxSiblings);
    }
    async getDominatorsOf(filePath, nodeId) {
        const snapshot = await this.getSnapshot(filePath);
        const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
        if (nodeIndex === undefined) {
            throw new Error(`Node with ID ${nodeId} not found`);
        }
        return await snapshot.proxy.getDominatorsOf(nodeIndex);
    }
    async getEdges(filePath, nodeId, options) {
        const snapshot = await this.getSnapshot(filePath);
        const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
        if (nodeIndex === undefined) {
            throw new Error(`Node with ID ${nodeId} not found`);
        }
        const provider = snapshot.proxy.createEdgesProvider(nodeIndex, options);
        return await provider.serializeItemsRange(0, Infinity);
    }
    async getClassDiffs(baseFilePath, currentFilePath) {
        const rawDiffs = await this.#getSortedRawClassDiffs(baseFilePath, currentFilePath);
        const classDiffs = [];
        const totals = {
            addedCount: 0,
            removedCount: 0,
            countDelta: 0,
            addedSize: 0,
            removedSize: 0,
            sizeDelta: 0,
        };
        for (const [index, rawDiff] of rawDiffs.entries()) {
            classDiffs.push({
                index,
                className: rawDiff.name,
                addedCount: rawDiff.addedCount,
                removedCount: rawDiff.removedCount,
                countDelta: rawDiff.countDelta,
                addedSize: rawDiff.addedSize,
                removedSize: rawDiff.removedSize,
                sizeDelta: rawDiff.sizeDelta,
            });
            totals.addedCount += rawDiff.addedCount;
            totals.removedCount += rawDiff.removedCount;
            totals.countDelta += rawDiff.countDelta;
            totals.addedSize += rawDiff.addedSize;
            totals.removedSize += rawDiff.removedSize;
            totals.sizeDelta += rawDiff.sizeDelta;
        }
        return { classDiffs, totals };
    }
    async getDetailedClassDiff(baseFilePath, currentFilePath, classIndex) {
        const classDiffs = await this.#getSortedRawClassDiffs(baseFilePath, currentFilePath);
        const rawDiff = classDiffs[classIndex];
        if (!rawDiff) {
            throw new Error(`Invalid classIndex: ${classIndex}. Total classes with changes: ${classDiffs.length}`);
        }
        return {
            index: classIndex,
            className: rawDiff.name,
            addedCount: rawDiff.addedCount,
            removedCount: rawDiff.removedCount,
            countDelta: rawDiff.countDelta,
            addedSize: rawDiff.addedSize,
            removedSize: rawDiff.removedSize,
            sizeDelta: rawDiff.sizeDelta,
            addedIds: rawDiff.addedIds ?? [],
            addedSelfSizes: rawDiff.addedSelfSizes ?? [],
            deletedIds: rawDiff.deletedIds ?? [],
            deletedSelfSizes: rawDiff.deletedSelfSizes ?? [],
        };
    }
    async #getSortedRawClassDiffs(baseFilePath, currentFilePath) {
        const [baseSnapshot, currentSnapshot] = await Promise.all([
            this.getSnapshot(baseFilePath),
            this.getSnapshot(currentFilePath),
        ]);
        const interfaceDefinitions = await currentSnapshot.proxy.interfaceDefinitions();
        const aggregatesForDiff = await baseSnapshot.proxy.aggregatesForDiff(interfaceDefinitions);
        const baseSnapshotId = baseSnapshot.proxy.uid;
        if (baseSnapshotId === undefined) {
            throw new Error('Base snapshot UID is undefined');
        }
        // DevTools calculateSnapshotDiff uses the first parameter (baseSnapshotId)
        // as a cache key. We pass the unique UID of the base snapshot.
        const rawDiffs = await currentSnapshot.proxy.calculateSnapshotDiff(baseSnapshotId, aggregatesForDiff);
        // Return a filtered and sorted array here to ensure that
        // compare_heapsnapshot_summary and compare_heapsnapshot_details agree
        // on indices.
        return Object.values(rawDiffs)
            .filter(diff => diff.addedCount > 0 || diff.removedCount > 0)
            .sort((a, b) => b.sizeDelta - a.sizeDelta);
    }
    async #loadSnapshot(absolutePath, uid) {
        const workerProxy = new DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy(() => {
            /* noop */
        }, DevTools.Common.Console.Console.instance(), import.meta.resolve('../third_party/devtools-heap-snapshot-worker.js'));
        try {
            const { promise: snapshotPromise, resolve: resolveSnapshot } = Promise.withResolvers();
            const loaderProxy = workerProxy.createLoader(uid, snapshotProxy => {
                resolveSnapshot(snapshotProxy);
            });
            const fileStream = fsSync.createReadStream(absolutePath, {
                encoding: 'utf-8',
                highWaterMark: 1024 * 1024,
            });
            for await (const chunk of fileStream) {
                await loaderProxy.write(chunk);
            }
            await loaderProxy.close();
            const snapshot = await snapshotPromise;
            // Assign ids to all aggregates of this snapshot. This ensures ids are available
            // even without calling getAggregates() and deterministic (do not depend on
            // the filter used on the getAggregates() call).
            const aggregates = await snapshot.aggregatesWithFilter(new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter());
            return new HeapSnapshot(snapshot, workerProxy, aggregates);
        }
        catch (error) {
            // Remove the rejected promise from #snapshots and dispose the worker to
            // avoid leaking it on a failed load (e.g. a missing or invalid
            // .heapsnapshot path).
            this.#snapshots.delete(absolutePath);
            workerProxy.dispose();
            throw error;
        }
    }
    async getDuplicateStrings(filePath) {
        const snapshot = await this.getSnapshot(filePath);
        return await snapshot.proxy.getDuplicateStrings();
    }
    async queryObjects(filePath, options) {
        const snapshot = await this.getSnapshot(filePath);
        const provider = snapshot.proxy.queryObjects(options);
        return await provider.serializeItemsRange(0, Infinity);
    }
    hasSnapshots() {
        return this.#snapshots.size > 0;
    }
    async disposeSnapshot(filePath) {
        const absolutePath = path.resolve(filePath);
        const cached = this.#snapshots.get(absolutePath);
        if (cached) {
            this.#snapshots.delete(absolutePath);
            const { worker } = await cached;
            worker.dispose();
            return true;
        }
        return false;
    }
    dispose() {
        void Promise.allSettled(this.#snapshots.values().map(async (cached) => {
            const { worker } = await cached;
            worker.dispose();
        }));
        this.#snapshots.clear();
    }
}
//# sourceMappingURL=HeapSnapshotManager.js.map