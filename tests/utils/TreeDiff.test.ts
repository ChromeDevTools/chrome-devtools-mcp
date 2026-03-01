/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {TreeDiff} from '../../src/utils/TreeDiff.js';

interface TestNode {
  id: string;
  children: TestNode[];
  val?: string;
}

function node(id: string, children: TestNode[] = [], val?: string): TestNode {
  return {id, children, val};
}

describe('TreeDiff', () => {
  it('returns "same" for identical trees', () => {
    const root = node('1', [node('2'), node('3')]);
    const diff = TreeDiff.compute(root, root);
    assert.strictEqual(diff.type, 'same');
    assert.strictEqual(diff.node, root);
    assert.strictEqual(diff.children.length, 2);
    assert.strictEqual(diff.children[0].type, 'same');
    assert.strictEqual(diff.children[1].type, 'same');
  });

  it('returns "modified" (root swap) if root IDs differ', () => {
    const oldRoot = node('1');
    const newRoot = node('2');
    const diff = TreeDiff.compute(oldRoot, newRoot);
    assert.strictEqual(diff.type, 'modified');
    assert.strictEqual(diff.node, newRoot);
    assert.strictEqual(diff.oldNode, oldRoot);
  });

  it('detects added children', () => {
    const oldRoot = node('1', [node('2')]);
    const newRoot = node('1', [node('2'), node('3')]);
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.type, 'same');
    assert.strictEqual(diff.children.length, 2);

    assert.strictEqual(diff.children[0].type, 'same');
    assert.strictEqual(diff.children[0].node.id, '2');

    assert.strictEqual(diff.children[1].type, 'added');
    assert.strictEqual(diff.children[1].node.id, '3');
  });

  it('detects removed children', () => {
    const oldRoot = node('1', [node('2'), node('3')]);
    const newRoot = node('1', [node('2')]);
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.type, 'same');
    assert.strictEqual(diff.children.length, 2);

    assert.strictEqual(diff.children[0].type, 'same');
    assert.strictEqual(diff.children[0].node.id, '2');

    assert.strictEqual(diff.children[1].type, 'removed');
    assert.strictEqual(diff.children[1].node.id, '3');
  });

  it('detects removal before match', () => {
    const oldRoot = node('1', [node('2'), node('3')]);
    const newRoot = node('1', [node('3')]);
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.children.length, 2);
    assert.strictEqual(diff.children[0].type, 'removed');
    assert.strictEqual(diff.children[0].node.id, '2');

    assert.strictEqual(diff.children[1].type, 'same');
    assert.strictEqual(diff.children[1].node.id, '3');
  });

  it('detects reordering (A, B -> B, A)', () => {
    const oldRoot = node('1', [node('A'), node('B')]);
    const newRoot = node('1', [node('B'), node('A')]);
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.children.length, 2);
    assert.strictEqual(diff.children[0].type, 'same');
    assert.strictEqual(diff.children[0].node.id, 'B');

    assert.strictEqual(diff.children[1].type, 'same');
    assert.strictEqual(diff.children[1].node.id, 'A');
  });

  it('recurses into children', () => {
    // Old: 1(2(3))
    // New: 1(2(3, 4)) -> 4 added
    const oldRoot = node('1', [node('2', [node('3')])]);
    const newRoot = node('1', [node('2', [node('3'), node('4')])]);
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.type, 'same');
    const child2 = diff.children[0];
    assert.strictEqual(child2.type, 'same');
    assert.strictEqual(child2.children.length, 2);
    assert.strictEqual(child2.children[0].type, 'same'); // 3
    assert.strictEqual(child2.children[1].type, 'added'); // 4
  });

  it('marks entire subtree as added when parent is added', () => {
    const oldRoot = node('1');
    const newRoot = node('1', [node('2', [node('3')])]);
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.children.length, 1);
    const node2 = diff.children[0];
    assert.strictEqual(node2.type, 'added');
    assert.strictEqual(node2.node.id, '2');

    assert.strictEqual(node2.children.length, 1);
    const node3 = node2.children[0];
    assert.strictEqual(node3.type, 'added');
    assert.strictEqual(node3.node.id, '3');
  });

  it('handles removed children deeply', () => {
    const oldRoot = node('1', [node('2', [node('3')])]);
    const newRoot = node('1', [node('2', [])]);
    const diff = TreeDiff.compute(oldRoot, newRoot);

    const child2 = diff.children[0];
    assert.strictEqual(child2.children.length, 1);
    assert.strictEqual(child2.children[0].type, 'removed');
    assert.strictEqual(child2.children[0].node.id, '3');
  });

  it('marks entire subtree as removed when parent is removed', () => {
    const oldRoot = node('1', [node('2', [node('3')])]);
    const newRoot = node('1');
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.children.length, 1);
    const node2 = diff.children[0];
    assert.strictEqual(node2.type, 'removed');
    assert.strictEqual(node2.node.id, '2');

    assert.strictEqual(node2.children.length, 1);
    const node3 = node2.children[0];
    assert.strictEqual(node3.type, 'removed');
    assert.strictEqual(node3.node.id, '3');
  });

  it('does not compare other properties', () => {
    const oldRoot = node('1', [], 'foo');
    const newRoot = node('1', [], 'bar');
    const diff = TreeDiff.compute(oldRoot, newRoot);

    assert.strictEqual(diff.type, 'same');
    assert.strictEqual(diff.node.val, 'bar');
  });
});
