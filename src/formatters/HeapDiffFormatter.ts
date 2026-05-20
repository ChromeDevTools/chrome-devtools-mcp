/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';

export interface FormattedDiffEntry {
  className: string;
  added: number;
  deleted: number;
  deltaSize: string;
}

export class HeapDiffFormatter {
  #diff: Record<string, DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff>;

  constructor(
    diff: Record<string, DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff>,
  ) {
    this.#diff = diff;
  }

  #getSortedDiffs(): DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff[] {
    return Object.values(this.#diff).sort((a, b) => b.sizeDelta - a.sizeDelta);
  }

  toString(): string {
    const sorted = this.#getSortedDiffs();
    const lines: string[] = [];
    lines.push('className,added,deleted,deltaSize');

    for (const d of sorted) {
      lines.push(
        `${d.name},${d.addedCount},${d.removedCount},${DevTools.I18n.ByteUtilities.formatBytesToKb(d.sizeDelta)}`,
      );
    }

    return lines.join('\n');
  }

  toJSON(): FormattedDiffEntry[] {
    const sorted = this.#getSortedDiffs();
    return sorted.map(d => ({
      className: d.name,
      added: d.addedCount,
      deleted: d.removedCount,
      deltaSize: DevTools.I18n.ByteUtilities.formatBytesToKb(d.sizeDelta),
    }));
  }

  static sort(
    diff: Record<string, DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff>,
  ): Array<[string, DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff]> {
    return Object.entries(diff).sort((a, b) => b[1].sizeDelta - a[1].sizeDelta);
  }
}
