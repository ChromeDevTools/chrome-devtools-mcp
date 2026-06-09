/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsSync from 'node:fs';
import path from 'node:path';

import {isNodeLike} from './formatters/HeapSnapshotFormatter.js';
import {DevTools} from './third_party/index.js';
import {
  createIdGenerator,
  stableIdSymbol,
  type WithSymbolId,
} from './utils/id.js';

export type AggregatedInfoWithId =
  WithSymbolId<DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo>;

export class HeapSnapshotManager {
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

    const {snapshot, worker} = await this.#loadSnapshot(absolutePath);
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

  async findNodeIndexById(
    filePath: string,
    nodeId: number,
  ): Promise<number | undefined> {
    const snapshot = await this.getSnapshot(filePath);
    const aggregates = await this.getAggregates(filePath);
    const filter =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();

    for (const classKey of Object.keys(aggregates)) {
      const provider = snapshot.createNodesProviderForClass(classKey, filter);
      const range = await provider.serializeItemsRange(0, Infinity);
      for (const item of range.items) {
        if (isNodeLike(item) && item.id === nodeId) {
          return item.nodeIndex;
        }
      }
    }
    return undefined;
  }

  async getRetainers(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    const nodeIndex = await this.findNodeIndexById(filePath, nodeId);
    if (nodeIndex === undefined) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    const snapshot = await this.getSnapshot(filePath);
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
    const nodeIndex = await this.findNodeIndexById(filePath, nodeId);
    if (nodeIndex === undefined) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    const snapshot = await this.getSnapshot(filePath);
    return await snapshot.getRetainingPaths(
      nodeIndex,
      maxDepth,
      maxNodes,
      maxSiblings,
    );
  }

  #getCachedSnapshot(filePath: string) {
    const absolutePath = path.resolve(filePath);
    const cached = this.#snapshots.get(absolutePath);
    if (!cached) {
      throw new Error(`Snapshot not loaded for ${filePath}`);
    }
    return cached;
  }

  async resolveClassKeyFromId(
    filePath: string,
    id: number,
  ): Promise<string | undefined> {
    const cached = this.#getCachedSnapshot(filePath);
    return cached.idToClassKey.get(id);
  }

  async #loadSnapshot(absolutePath: string): Promise<{
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

    const loaderProxy = workerProxy.createLoader(1, snapshotProxy => {
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
