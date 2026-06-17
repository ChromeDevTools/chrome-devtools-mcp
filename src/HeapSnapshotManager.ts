/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsSync from 'node:fs';
import path from 'node:path';

import {DevTools} from './third_party/index.js';
import {
  createIdGenerator,
  stableIdSymbol,
  type WithSymbolId,
} from './utils/id.js';

export type AggregatedInfoWithId =
  WithSymbolId<DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo>;

export interface HeapSnapshotClassDiff {
  className: string;
  addedCount: number;
  removedCount: number;
  countDelta: number;
  addedSize: number;
  removedSize: number;
  sizeDelta: number;
}

export interface HeapSnapshotDetailedClassDiff extends HeapSnapshotClassDiff {
  addedIds: number[];
  addedSelfSizes: number[];
  deletedIds: number[];
  deletedSelfSizes: number[];
}

export type DuplicateStringGroup =
  DevTools.HeapSnapshotModel.HeapSnapshotModel.DuplicateStringGroup;

export class HeapSnapshotManager {
  #snapshotIdGenerator = createIdGenerator();
  #snapshots = new Map<
    string,
    {
      snapshot: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy;
      worker: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy;
      // TODO: use a multimap
      idToClassKey: Map<number, string>;
      classKeyToId: Map<string, number>;
      idGenerator: () => number;
    }
  >();

  async getSnapshot(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy> {
    const absolutePath = path.resolve(filePath);
    const cached = this.#snapshots.get(absolutePath);
    if (cached) {
      return cached.snapshot;
    }

    const uid = this.#snapshotIdGenerator();
    const {snapshot, worker} = await this.#loadSnapshot(absolutePath, uid);
    this.#snapshots.set(absolutePath, {
      snapshot,
      worker,
      idToClassKey: new Map<number, string>(),
      classKeyToId: new Map<string, number>(),
      idGenerator: createIdGenerator(),
    });

    return snapshot;
  }

  async getAggregates(
    filePath: string,
  ): Promise<Record<string, AggregatedInfoWithId>> {
    const snapshot = await this.getSnapshot(filePath);
    const filter =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
    const aggregates: Record<string, AggregatedInfoWithId> =
      await snapshot.aggregatesWithFilter(filter);

    for (const key of Object.keys(aggregates)) {
      const id = await this.getOrCreateIdForClassKey(filePath, key);
      const aggregate = aggregates[key];
      if (aggregate) {
        aggregate[stableIdSymbol] = id;
      }
    }

    return aggregates;
  }

  async getStats(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics> {
    const snapshot = await this.getSnapshot(filePath);
    return await snapshot.getStatistics();
  }

  async getStaticData(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null> {
    const snapshot = await this.getSnapshot(filePath);
    return snapshot.staticData;
  }

  async getOrCreateIdForClassKey(
    filePath: string,
    classKey: string,
  ): Promise<number> {
    const cached = this.#getCachedSnapshot(filePath);
    let id = cached.classKeyToId.get(classKey);
    if (!id) {
      id = cached.idGenerator();
      cached.classKeyToId.set(classKey, id);
      cached.idToClassKey.set(id, classKey);
    }
    return id;
  }

  async getNodesById(
    filePath: string,
    id: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    const snapshot = await this.getSnapshot(filePath);
    const filter =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
    const className = await this.resolveClassKeyFromId(filePath, id);
    if (!className) {
      throw new Error(`Class with ID ${id} not found in heap snapshot`);
    }
    const provider = snapshot.createNodesProviderForClass(className, filter);

    return await provider.serializeItemsRange(0, Infinity);
  }

  async getRetainers(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    const snapshot = await this.getSnapshot(filePath);
    const nodeIndex = await snapshot.nodeIndexForId(nodeId);
    if (nodeIndex === undefined) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    const provider = snapshot.createRetainingEdgesProvider(nodeIndex);
    return await provider.serializeItemsRange(0, Infinity);
  }

  async getRetainingPaths(
    filePath: string,
    nodeId: number,
    maxDepth?: number,
    maxNodes?: number,
    maxSiblings?: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths> {
    const snapshot = await this.getSnapshot(filePath);
    const nodeIndex = await snapshot.nodeIndexForId(nodeId);
    if (nodeIndex === undefined) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    return await snapshot.getRetainingPaths(
      nodeIndex,
      maxDepth,
      maxNodes,
      maxSiblings,
    );
  }

  async getDominatorsOf(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain> {
    const snapshot = await this.getSnapshot(filePath);
    const nodeIndex = await snapshot.nodeIndexForId(nodeId);
    if (nodeIndex === undefined) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    return await snapshot.getDominatorsOf(nodeIndex);
  }

  async getEdges(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    const snapshot = await this.getSnapshot(filePath);
    const nodeIndex = await snapshot.nodeIndexForId(nodeId);
    if (nodeIndex === undefined) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    const provider = snapshot.createEdgesProvider(nodeIndex);
    return await provider.serializeItemsRange(0, Infinity);
  }

  async getClassDiffs(
    baseFilePath: string,
    currentFilePath: string,
  ): Promise<HeapSnapshotClassDiff[]> {
    const rawDiffs = await this.#getSortedRawClassDiffs(
      baseFilePath,
      currentFilePath,
    );
    return rawDiffs.map(rawDiff => ({
      className: rawDiff.name,
      addedCount: rawDiff.addedCount,
      removedCount: rawDiff.removedCount,
      countDelta: rawDiff.countDelta,
      addedSize: rawDiff.addedSize,
      removedSize: rawDiff.removedSize,
      sizeDelta: rawDiff.sizeDelta,
    }));
  }

  async getDetailedClassDiff(
    baseFilePath: string,
    currentFilePath: string,
    classIndex: number,
  ): Promise<HeapSnapshotDetailedClassDiff> {
    const classDiffs = await this.#getSortedRawClassDiffs(
      baseFilePath,
      currentFilePath,
    );
    const rawDiff = classDiffs[classIndex];
    if (!rawDiff) {
      throw new Error(
        `Invalid classIndex: ${classIndex}. Total classes with changes: ${classDiffs.length}`,
      );
    }
    return {
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

  #getCachedSnapshot(filePath: string) {
    const absolutePath = path.resolve(filePath);
    const cached = this.#snapshots.get(absolutePath);
    if (!cached) {
      throw new Error(`Snapshot not loaded for ${filePath}`);
    }
    return cached;
  }

  async #getSortedRawClassDiffs(
    baseFilePath: string,
    currentFilePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff[]> {
    const baseSnapshot = await this.getSnapshot(baseFilePath);
    const currentSnapshot = await this.getSnapshot(currentFilePath);

    const interfaceDefinitions = await currentSnapshot.interfaceDefinitions();
    const aggregatesForDiff =
      await baseSnapshot.aggregatesForDiff(interfaceDefinitions);
    const baseSnapshotId = baseSnapshot.uid;
    if (baseSnapshotId === undefined) {
      throw new Error('Base snapshot UID is undefined');
    }
    // DevTools calculateSnapshotDiff uses the first parameter (baseSnapshotId)
    // as a cache key. We pass the unique UID of the base snapshot.
    const rawDiffs = await currentSnapshot.calculateSnapshotDiff(
      baseSnapshotId,
      aggregatesForDiff,
    );

    // Return a filtered and sorted array here to ensure that
    // compare_heapsnapshot_summary and compare_heapsnapshot_details agree
    // on indices.
    return Object.values(rawDiffs)
      .filter(diff => diff.addedCount > 0 || diff.removedCount > 0)
      .sort((a, b) => b.sizeDelta - a.sizeDelta);
  }

  async resolveClassKeyFromId(
    filePath: string,
    id: number,
  ): Promise<string | undefined> {
    const cached = this.#getCachedSnapshot(filePath);
    return cached.idToClassKey.get(id);
  }

  async #loadSnapshot(
    absolutePath: string,
    uid: number,
  ): Promise<{
    snapshot: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy;
    worker: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy;
  }> {
    const workerProxy =
      new DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy(
        () => {
          /* noop */
        },
        import.meta.resolve('./third_party/devtools-heap-snapshot-worker.js'),
      );

    const {promise: snapshotPromise, resolve: resolveSnapshot} =
      Promise.withResolvers<DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy>();

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
    return {snapshot, worker: workerProxy};
  }

  async getDuplicateStrings(filePath: string): Promise<DuplicateStringGroup[]> {
    const snapshot = await this.getSnapshot(filePath);
    return await snapshot.getDuplicateStrings();
  }

  hasSnapshots(): boolean {
    return this.#snapshots.size > 0;
  }

  dispose(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    const cached = this.#snapshots.get(absolutePath);
    if (cached) {
      cached.worker.dispose();
      this.#snapshots.delete(absolutePath);
      return true;
    }
    return false;
  }
}
