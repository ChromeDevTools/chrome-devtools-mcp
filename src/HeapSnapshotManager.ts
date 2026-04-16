/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsSync from 'node:fs';
import path from 'node:path';

import {DevTools} from './third_party/index.js';

export class HeapSnapshotManager {
  #snapshots = new Map<
    string,
    {
      snapshot: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy;
      worker: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy;
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
    this.#snapshots.set(absolutePath, {snapshot, worker});

    return snapshot;
  }

  async getAggregates(
    filePath: string,
  ): Promise<
    Record<string, DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo>
  > {
    const snapshot = await this.getSnapshot(filePath);
    const filter =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
    return await snapshot.aggregatesWithFilter(filter);
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
