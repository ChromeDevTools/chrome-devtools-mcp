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

export type AggregatedInfoWithUid =
  WithSymbolId<DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo>;

export class HeapSnapshotManager {
  #snapshots = new Map<
    string,
    {
      snapshot: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy;
      worker: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy;
      // TODO: use a multimap
      uidToClassKey: Map<number, string>;
      classKeyToUid: Map<string, number>;
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
      uidToClassKey: new Map<number, string>(),
      classKeyToUid: new Map<string, number>(),
      idGenerator: createIdGenerator(),
    });

    return snapshot;
  }

  async getAggregates(
    filePath: string,
  ): Promise<Record<string, AggregatedInfoWithUid>> {
    const snapshot = await this.getSnapshot(filePath);
    const filter =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
    const aggregates: Record<string, AggregatedInfoWithUid> =
      await snapshot.aggregatesWithFilter(filter);

    for (const key of Object.keys(aggregates)) {
      const uid = await this.getOrCreateUidForClassKey(filePath, key);
      const aggregate = aggregates[key];
      if (aggregate) {
        aggregate[stableIdSymbol] = uid;
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

  async getOrCreateUidForClassKey(
    filePath: string,
    classKey: string,
  ): Promise<number> {
    const cached = this.#getCachedSnapshot(filePath);
    let uid = cached.classKeyToUid.get(classKey);
    if (!uid) {
      uid = cached.idGenerator();
      cached.classKeyToUid.set(classKey, uid);
      cached.uidToClassKey.set(uid, classKey);
    }
    return uid;
  }

  async getNodesByUid(
    filePath: string,
    uid: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    const snapshot = await this.getSnapshot(filePath);
    const filter =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
    const className = await this.resolveClassKeyFromUid(filePath, uid);
    if (!className) {
      throw new Error(`Class with UID ${uid} not found in heap snapshot`);
    }
    const provider = snapshot.createNodesProviderForClass(className, filter);

    const range = await provider.serializeItemsRange(0, 1);
    return await provider.serializeItemsRange(0, range.totalLength);
  }

  #getCachedSnapshot(filePath: string) {
    const absolutePath = path.resolve(filePath);
    const cached = this.#snapshots.get(absolutePath);
    if (!cached) {
      throw new Error(`Snapshot not loaded for ${filePath}`);
    }
    return cached;
  }

  async resolveClassKeyFromUid(
    filePath: string,
    uid: number,
  ): Promise<string | undefined> {
    const cached = this.#getCachedSnapshot(filePath);
    return cached.uidToClassKey.get(uid);
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

  dispose(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    const cached = this.#snapshots.get(absolutePath);
    if (cached) {
      cached.worker.dispose();
      this.#snapshots.delete(absolutePath);
    }
  }
}
