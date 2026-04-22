/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {AggregatedInfoWithUid} from '../HeapSnapshotManager.js';
import type {DevTools} from '../third_party/index.js';
import {stableIdSymbol} from '../utils/id.js';

export interface FormattedSnapshotEntry {
  className: string;
  classUid?: number;
  count: number;
  selfSize: number;
  retainedSize: number;
}

function isNodeLike(
  item: unknown,
): item is DevTools.HeapSnapshotModel.HeapSnapshotModel.Node {
  return (
    typeof item === 'object' && item !== null && 'id' in item && 'name' in item
  );
}

export class HeapSnapshotFormatter {
  #aggregates: Record<string, AggregatedInfoWithUid>;

  constructor(aggregates: Record<string, AggregatedInfoWithUid>) {
    this.#aggregates = aggregates;
  }

  static formatNodes(
    items: ReadonlyArray<
      | DevTools.HeapSnapshotModel.HeapSnapshotModel.Node
      | DevTools.HeapSnapshotModel.HeapSnapshotModel.Edge
    >,
  ): string {
    const lines: string[] = [];

    if (items.length > 0 && isNodeLike(items[0])) {
      lines.push('id,name,type,distance,selfSize,retainedSize');
    }

    for (const item of items) {
      if (isNodeLike(item)) {
        lines.push(
          `${item.id},"${item.name}",${item.type},${item.distance},${item.selfSize},${item.retainedSize}`,
        );
      }
    }

    return lines.join('\n');
  }

  #getSortedAggregates(): AggregatedInfoWithUid[] {
    return Object.values(this.#aggregates).sort((a, b) => b.self - a.self);
  }

  toString(): string {
    const sorted = this.#getSortedAggregates();
    const lines: string[] = [];
    lines.push('uid,className,count,selfSize,maxRetainedSize');

    for (const info of sorted) {
      const uid = info[stableIdSymbol] ?? '';
      lines.push(
        `${uid},"${info.name}",${info.count},${info.self},${info.maxRet}`,
      );
    }

    return lines.join('\n');
  }

  toJSON(): FormattedSnapshotEntry[] {
    const sorted = this.#getSortedAggregates();
    return sorted.map(info => ({
      uid: info[stableIdSymbol],
      className: info.name,
      count: info.count,
      selfSize: info.self,
      retainedSize: info.maxRet,
    }));
  }

  static sort(
    aggregates: Record<
      string,
      DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
    >,
  ): Array<
    [string, DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo]
  > {
    return Object.entries(aggregates).sort((a, b) => b[1].self - a[1].self);
  }
}
