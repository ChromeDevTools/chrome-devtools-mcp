/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TextSnapshot, TextSnapshotNode} from '../McpContext.js';
import {TreeDiff, type DiffNode} from '../utils/TreeDiff.js';

import {SnapshotFormatter} from './SnapshotFormatter.js';

export class SnapshotDiffFormatter {
  #root: DiffNode<TextSnapshotNode>;
  #oldFormatter: SnapshotFormatter;
  #newFormatter: SnapshotFormatter;

  constructor(
    root: DiffNode<TextSnapshotNode>,
    oldFormatter: SnapshotFormatter,
    newFormatter: SnapshotFormatter,
  ) {
    this.#root = root;
    this.#oldFormatter = oldFormatter;
    this.#newFormatter = newFormatter;
  }

  toString(): string {
    const lines = this.#formatDiffNode(this.#root, 0);
    const hasChanges = lines.some(l => l.startsWith('+') || l.startsWith('-'));
    if (!hasChanges) {
      return '';
    }
    return lines.join('').trimEnd();
  }

  #formatDiffNode(
    diffNode: DiffNode<TextSnapshotNode>,
    depth: number,
  ): string[] {
    const chunks: string[] = [];

    if (diffNode.type === 'same') {
      const oldLine = this.#oldFormatter.formatNodeSelf(
        diffNode.oldNode!,
        depth,
      );
      const newLine = this.#newFormatter.formatNodeSelf(diffNode.node, depth);
      if (oldLine === newLine) {
        chunks.push(' ' + newLine);
      } else {
        chunks.push('- ' + oldLine);
        chunks.push('+ ' + newLine);
      }
      // Children
      for (const child of diffNode.children) {
        chunks.push(...this.#formatDiffNode(child, depth + 1));
      }
    } else if (diffNode.type === 'added') {
      chunks.push(
        '+ ' + this.#newFormatter.formatNodeSelf(diffNode.node, depth),
      );
      // Recursively add children (they are also 'added' in the tree)
      for (const child of diffNode.children) {
        chunks.push(...this.#formatDiffNode(child, depth + 1));
      }
    } else if (diffNode.type === 'removed') {
      chunks.push(
        '- ' + this.#oldFormatter.formatNodeSelf(diffNode.node, depth),
      );
      // Recursively remove children (they are also 'removed' in the tree)
      for (const child of diffNode.children) {
        chunks.push(...this.#formatDiffNode(child, depth + 1));
      }
    } else if (diffNode.type === 'modified') {
      chunks.push(
        '- ' + this.#oldFormatter.formatNodeSelf(diffNode.oldNode!, depth),
      );
      chunks.push(
        '+ ' + this.#newFormatter.formatNodeSelf(diffNode.node, depth),
      );
    }

    return chunks;
  }

  toJSON(): object {
    return this.#nodeToJSON(this.#root) ?? {};
  }

  #nodeToJSON(diffNode: DiffNode<TextSnapshotNode>): object | null {
    if (diffNode.type === 'same') {
      const oldJson = this.#oldFormatter.nodeToJSON(diffNode.oldNode!);
      const newJson = this.#newFormatter.nodeToJSON(diffNode.node);
      const childrenDiff = diffNode.children
        .map(child => this.#nodeToJSON(child))
        .filter(x => x !== null);

      const contentChanged =
        JSON.stringify(oldJson) !== JSON.stringify(newJson);

      if (!contentChanged && childrenDiff.length === 0) {
        return null;
      }

      const result: Record<string, unknown> = {};
      if (contentChanged) {
        result.type = 'modified';
        result.oldAttributes = oldJson;
        result.newAttributes = newJson;
      } else {
        result.type = 'unchanged';
        result.id = diffNode.node.id;
      }

      if (childrenDiff.length > 0) {
        result.children = childrenDiff;
      }
      return result;
    } else if (diffNode.type === 'added') {
      return {
        type: 'added',
        node: this.#newFormatter.nodeToJSON(diffNode.node),
      };
    } else if (diffNode.type === 'removed') {
      return {
        type: 'removed',
        node: this.#oldFormatter.nodeToJSON(diffNode.node),
      };
    } else if (diffNode.type === 'modified') {
      return {
        type: 'modified',
        oldNode: this.#oldFormatter.nodeToJSON(diffNode.oldNode!),
        newNode: this.#newFormatter.nodeToJSON(diffNode.node),
      };
    }
    return null;
  }

  static diff(
    oldSnapshot: TextSnapshot,
    newSnapshot: TextSnapshot,
  ): SnapshotDiffFormatter {
    const diffRoot = TreeDiff.compute(oldSnapshot.root, newSnapshot.root);
    const oldFormatter = new SnapshotFormatter(oldSnapshot);
    const newFormatter = new SnapshotFormatter(newSnapshot);
    return new SnapshotDiffFormatter(diffRoot, oldFormatter, newFormatter);
  }
}
