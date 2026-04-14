/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {DevTools} from '../third_party/index.js';

export interface FormattedSnapshotEntry {
  className: string;
  count: number;
  selfSize: number;
  retainedSize: number;
}

export class HeapSnapshotFormatter {
  #aggregates: Record<
    string,
    DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
  >;

  constructor(
    aggregates: Record<
      string,
      DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
    >,
  ) {
    this.#aggregates = aggregates;
  }

  #getSortedAggregates(): DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo[] {
    return Object.values(this.#aggregates).sort((a, b) => b.self - a.self);
  }

  toString(): string {
    const sorted = this.#getSortedAggregates();
    const lines: string[] = [];
    lines.push('className,count,selfSize,maxRetainedSize');

    for (const info of sorted) {
      lines.push(`"${info.name}",${info.count},${info.self},${info.maxRet}`);
    }

    return lines.join('\n');
  }

  toJSON(): FormattedSnapshotEntry[] {
    const sorted = this.#getSortedAggregates();
    return sorted.map(info => ({
      className: info.name,
      count: info.count,
      selfSize: info.self,
      retainedSize: info.maxRet,
    }));
  }
}
