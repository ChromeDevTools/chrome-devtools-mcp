/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface Node<T> {
  id: string;
  children: T[];
}

export interface DiffNode<T> {
  type: 'same' | 'added' | 'removed' | 'modified';
  node: T;
  oldNode?: T;
  children: Array<DiffNode<T>>;
}

export class TreeDiff {
  static compute<T extends Node<T>>(oldNode: T, newNode: T): DiffNode<T> {
    if (oldNode.id !== newNode.id) {
      // Different IDs implies a replacement (remove old, add new).
      // We return 'modified' to represent this at the root level,
      // but strictly speaking it's a swap.
      return {
        type: 'modified',
        node: newNode,
        oldNode: oldNode,
        children: [],
      };
    }

    const childrenDiff = this.#diffChildren(oldNode.children, newNode.children);

    return {
      type: 'same',
      node: newNode,
      oldNode: oldNode,
      children: childrenDiff,
    };
  }

  static #diffChildren<T extends Node<T>>(
    oldChildren: T[],
    newChildren: T[],
  ): Array<DiffNode<T>> {
    const result: Array<DiffNode<T>> = [];

    // Index old children for O(1) lookup
    const oldMap = new Map<string, {node: T; index: number}>();
    oldChildren.forEach((node, index) => {
      oldMap.set(node.id, {node, index});
    });

    // Set of new keys for quick existence check
    const newKeys = new Set(newChildren.map(n => n.id));

    let cursor = 0;

    for (const newChild of newChildren) {
      const oldEntry = oldMap.get(newChild.id);

      if (oldEntry) {
        // Matched by ID
        const {node: oldChild, index: oldIndex} = oldEntry;

        // Check for removals of nodes skipped in the old list
        if (oldIndex >= cursor) {
          for (let i = cursor; i < oldIndex; i++) {
            const candidate = oldChildren[i];
            // If the candidate is NOT in the new list, it was removed.
            // If it IS in the new list, it was moved (we'll see it later).
            if (!newKeys.has(candidate.id)) {
              result.push({
                type: 'removed',
                node: candidate,
                children: this.#allRemoved(candidate.children),
              });
            }
          }
          cursor = oldIndex + 1;
        }

        // Recurse on the match
        result.push(this.compute(oldChild, newChild));
      } else {
        // Added
        result.push({
          type: 'added',
          node: newChild,
          children: this.#allAdded(newChild.children),
        });
      }
    }

    // Append any remaining removals from the end of the old list
    if (cursor < oldChildren.length) {
      for (let i = cursor; i < oldChildren.length; i++) {
        const candidate = oldChildren[i];
        if (!newKeys.has(candidate.id)) {
          result.push({
            type: 'removed',
            node: candidate,
            children: this.#allRemoved(candidate.children),
          });
        }
      }
    }

    return result;
  }

  static #allAdded<T extends Node<T>>(nodes: T[]): Array<DiffNode<T>> {
    return nodes.map(node => ({
      type: 'added',
      node: node,
      children: this.#allAdded(node.children),
    }));
  }

  static #allRemoved<T extends Node<T>>(nodes: T[]): Array<DiffNode<T>> {
    return nodes.map(node => ({
      type: 'removed',
      node: node,
      children: this.#allRemoved(node.children),
    }));
  }
}
