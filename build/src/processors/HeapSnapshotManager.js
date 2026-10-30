/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import fsSync from 'node:fs';
import path from 'node:path';
import { DevTools } from '../third_party/index.js';
import { createIdGenerator } from '../utils/id.js';
function toClassDiff(index, rawDiff) {
    return {
        index,
        className: rawDiff.name,
        addedCount: rawDiff.addedCount,
        removedCount: rawDiff.removedCount,
        countDelta: rawDiff.countDelta,
        addedSize: rawDiff.addedSize,
        removedSize: rawDiff.removedSize,
        sizeDelta: rawDiff.sizeDelta,
    };
}
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
    /**
     * Queue for all heap snapshot work, with one child queue per absolute file
     * path. A read of one file holds the file queue, so reads of different
     * files run at the same time. A read of several files holds this queue.
     * `disposeSnapshot()` holds the file queue, so it waits for in-flight
     * reads of the file, and a read that starts after it loads the file again.
     */
    #taskQueue;
    #taskRunner;
    #fileTaskQueues = new Map();
    constructor(taskRunner) {
        this.#taskRunner = taskRunner;
        this.#taskQueue = taskRunner.createQueue();
    }
    /**
     * Holds the queue of `filePath`, or the heap queue without a path, until
     * the guard is disposed.
     */
    async #scheduleTask(filePath) {
        if (filePath === undefined) {
            return await this.#taskQueue.scheduleTask();
        }
        const absolutePath = path.resolve(filePath);
        let queue = this.#fileTaskQueues.get(absolutePath);
        if (!queue) {
            queue = this.#taskRunner.createQueue(this.#taskQueue);
            this.#fileTaskQueues.set(absolutePath, queue);
        }
        return await queue.scheduleTask();
    }
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
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_1, await this.#scheduleTask(filePath), false);
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
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    async getStats(filePath) {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_2, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            return await snapshot.proxy.getStatistics();
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    async getStaticData(filePath) {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_3, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            return snapshot.proxy.staticData;
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    }
    async getNativeContextSizes(filePath) {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_4, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            return await snapshot.proxy.getNativeContextSizes();
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    }
    async getRetainedByContextSummary(filePath) {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_5, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            return await snapshot.proxy.getRetainedByContextSummary();
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    }
    async getNodesById(filePath, id, filterName, objectId) {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_6, await this.#scheduleTask(filePath), false);
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
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    }
    async getRetainers(filePath, nodeId) {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_7, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
            if (nodeIndex === undefined) {
                throw new Error(`Node with ID ${nodeId} not found`);
            }
            const provider = snapshot.proxy.createRetainingEdgesProvider(nodeIndex);
            return await provider.serializeItemsRange(0, Infinity);
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    }
    async getObjectInfo(filePath, nodeId) {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_8, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
            if (nodeIndex === undefined) {
                throw new Error(`Node with ID ${nodeId} not found`);
            }
            return await snapshot.proxy.getObjectInfo(nodeIndex);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    }
    async analyzeContexts(filePath) {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_9, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            return await snapshot.proxy.analyzeContexts();
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            __disposeResources(env_9);
        }
    }
    async getRetainingPaths(filePath, nodeId, maxDepth, maxNodes, maxSiblings) {
        const env_10 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_10, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
            if (nodeIndex === undefined) {
                throw new Error(`Node with ID ${nodeId} not found`);
            }
            return await snapshot.proxy.getRetainingPaths(nodeIndex, maxDepth, maxNodes, maxSiblings);
        }
        catch (e_10) {
            env_10.error = e_10;
            env_10.hasError = true;
        }
        finally {
            __disposeResources(env_10);
        }
    }
    async getDominatorsOf(filePath, nodeId) {
        const env_11 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_11, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
            if (nodeIndex === undefined) {
                throw new Error(`Node with ID ${nodeId} not found`);
            }
            return await snapshot.proxy.getDominatorsOf(nodeIndex);
        }
        catch (e_11) {
            env_11.error = e_11;
            env_11.hasError = true;
        }
        finally {
            __disposeResources(env_11);
        }
    }
    async getEdges(filePath, nodeId, options) {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_12, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            const nodeIndex = await snapshot.proxy.nodeIndexForId(nodeId);
            if (nodeIndex === undefined) {
                throw new Error(`Node with ID ${nodeId} not found`);
            }
            const provider = snapshot.proxy.createEdgesProvider(nodeIndex, options);
            return await provider.serializeItemsRange(0, Infinity);
        }
        catch (e_12) {
            env_12.error = e_12;
            env_12.hasError = true;
        }
        finally {
            __disposeResources(env_12);
        }
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
            classDiffs.push(toClassDiff(index, rawDiff));
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
        const objects = [];
        const addedIds = rawDiff.addedIds ?? [];
        const addedSelfSizes = rawDiff.addedSelfSizes ?? [];
        for (const [i, id] of addedIds.entries()) {
            objects.push({ id, selfSize: addedSelfSizes[i], change: 'added' });
        }
        const deletedIds = rawDiff.deletedIds ?? [];
        const deletedSelfSizes = rawDiff.deletedSelfSizes ?? [];
        for (const [i, id] of deletedIds.entries()) {
            objects.push({ id, selfSize: deletedSelfSizes[i], change: 'deleted' });
        }
        // Largest objects first so that the first page of paginated output shows
        // the most significant changes.
        objects.sort((a, b) => b.selfSize - a.selfSize);
        return { classDiff: toClassDiff(classIndex, rawDiff), objects };
    }
    async #getSortedRawClassDiffs(baseFilePath, currentFilePath) {
        const env_13 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_13, await this.#scheduleTask(), false);
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
        catch (e_13) {
            env_13.error = e_13;
            env_13.hasError = true;
        }
        finally {
            __disposeResources(env_13);
        }
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
        const env_14 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_14, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            return await snapshot.proxy.getDuplicateStrings();
        }
        catch (e_14) {
            env_14.error = e_14;
            env_14.hasError = true;
        }
        finally {
            __disposeResources(env_14);
        }
    }
    async queryObjects(filePath, options) {
        const env_15 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_15, await this.#scheduleTask(filePath), false);
            const snapshot = await this.getSnapshot(filePath);
            const provider = snapshot.proxy.queryObjects(options);
            return await provider.serializeItemsRange(0, Infinity);
        }
        catch (e_15) {
            env_15.error = e_15;
            env_15.hasError = true;
        }
        finally {
            __disposeResources(env_15);
        }
    }
    hasSnapshots() {
        return this.#snapshots.size > 0;
    }
    async disposeSnapshot(filePath) {
        const env_16 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_16, await this.#scheduleTask(filePath), false);
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
        catch (e_16) {
            env_16.error = e_16;
            env_16.hasError = true;
        }
        finally {
            __disposeResources(env_16);
        }
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