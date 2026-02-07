/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import {SnapshotDiffFormatter} from '../../src/formatters/SnapshotDiffFormatter.js';
import {
  type TextSnapshot,
  type TextSnapshotNode,
} from '../../src/McpContext.js';

function createNode(
  id: string,
  children: TextSnapshotNode[] = [],
  name?: string,
): TextSnapshotNode {
  return {
    id,
    children,
    name,
    role: 'generic',
    elementHandle: async () => null,
  };
}

function createSnapshot(root: TextSnapshotNode): TextSnapshot {
  return {
    root,
    hasSelectedElement: false,
    selectedElementUid: '1',
    verbose: false,
    snapshotId: '1',
    idToNode: new Map(),
  };
}

describe('SnapshotDiffFormatter', () => {
  const methods = ['toString', 'toJSON'] as const;
  for (const method of methods) {
    describe(method, () => {
      it('shows no changes for identical snapshots', t => {
        const snapshot = createSnapshot(
          createNode('1', [createNode('2'), createNode('3')]),
        );

        const diff = SnapshotDiffFormatter.diff(snapshot, snapshot);
        const output = diff[method]();
        t.assert.snapshot?.(JSON.stringify(output, null, 2));
      });

      it('detects added nodes', t => {
        const oldSnapshot = createSnapshot(createNode('1', [createNode('2')]));
        const newSnapshot = createSnapshot(
          createNode('1', [createNode('2'), createNode('3')]),
        );

        const diff = SnapshotDiffFormatter.diff(oldSnapshot, newSnapshot);
        const output = diff[method]();
        t.assert.snapshot?.(JSON.stringify(output, null, 2));
      });

      it('detects added nodes with children', t => {
        const oldSnapshot = createSnapshot(createNode('1', [createNode('2')]));
        const newSnapshot = createSnapshot(
          createNode('1', [
            createNode('2'),
            createNode('3', [createNode('4')]),
          ]),
        );

        const diff = SnapshotDiffFormatter.diff(oldSnapshot, newSnapshot);
        const output = diff[method]();
        t.assert.snapshot?.(JSON.stringify(output, null, 2));
      });

      it('detects removed nodes', t => {
        const oldSnapshot = createSnapshot(
          createNode('1', [createNode('2'), createNode('3')]),
        );
        const newSnapshot = createSnapshot(createNode('1', [createNode('2')]));

        const diff = SnapshotDiffFormatter.diff(oldSnapshot, newSnapshot);
        const output = diff[method]();
        t.assert.snapshot?.(JSON.stringify(output, null, 2));
      });

      it('detects removed nodes with children', t => {
        const oldSnapshot = createSnapshot(
          createNode('1', [
            createNode('2'),
            createNode('3', [createNode('4')]),
          ]),
        );
        const newSnapshot = createSnapshot(createNode('1', [createNode('2')]));

        const diff = SnapshotDiffFormatter.diff(oldSnapshot, newSnapshot);
        const output = diff[method]();
        t.assert.snapshot?.(JSON.stringify(output, null, 2));
      });

      it('detects modified nodes (attributes)', t => {
        const oldSnapshot = createSnapshot(
          createNode('1', [createNode('2', [], 'old')]),
        );
        const newSnapshot = createSnapshot(
          createNode('1', [createNode('2', [], 'new')]),
        );

        const diff = SnapshotDiffFormatter.diff(oldSnapshot, newSnapshot);
        const output = diff[method]();
        t.assert.snapshot?.(JSON.stringify(output, null, 2));
      });

      it('detects reordering (as remove + add)', t => {
        const oldSnapshot = createSnapshot(
          createNode('1', [createNode('2'), createNode('3')]),
        );
        const newSnapshot = createSnapshot(
          createNode('1', [createNode('3'), createNode('2')]),
        );
        const diff = SnapshotDiffFormatter.diff(oldSnapshot, newSnapshot);
        // Re-order should not be detected as a change
        // with justifications that re-orders on the sites seem
        // less likely and the position of an element in a list
        // is not as important for acting on the element.
        const output = diff[method]();
        t.assert.snapshot?.(JSON.stringify(output, null, 2));
      });
    });
  }
});
