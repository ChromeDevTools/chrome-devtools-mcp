/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TextSnapshot, TextSnapshotNode} from '../types.js';

export class SnapshotFormatter {
  #snapshot: TextSnapshot;

  constructor(snapshot: TextSnapshot) {
    this.#snapshot = snapshot;
  }

  toString(): string {
    const lines: string[] = [];
    const root = this.#snapshot.root;

    if (
      this.#snapshot.verbose &&
      this.#snapshot.hasSelectedElement &&
      !this.#snapshot.selectedElementUid
    ) {
      lines.push(
        `Note: there is a selected element in the DevTools Elements panel but it is not included into the current a11y tree snapshot.`,
      );
      lines.push(
        `Get a verbose snapshot to include all elements if you are interested in the selected element.\n`,
      );
    }

    this.#formatNodeFlat(root, 0, lines);
    return lines.join('\n') + '\n';
  }

  toJSON(): object {
    return this.#nodeToJSON(this.#snapshot.root);
  }

  #formatNodeFlat(node: TextSnapshotNode, depth: number, out: string[]): void {
    const attributes = this.#getAttributes(node);
    const indent = '  '.repeat(depth);
    const selected =
      node.id === this.#snapshot.selectedElementUid
        ? ' [selected in the DevTools Elements panel]'
        : '';
    out.push(indent + attributes.join(' ') + selected);
    for (const child of node.children) {
      this.#formatNodeFlat(child, depth + 1, out);
    }
  }

  #nodeToJSON(node: TextSnapshotNode): object {
    const rawAttrs = this.#getAttributesMap(node);
    const result: Record<string, unknown> = {...rawAttrs};
    if (node.children.length > 0) {
      result.children = node.children.map(child => this.#nodeToJSON(child));
    }
    return result;
  }

  #getAttributes(node: TextSnapshotNode): string[] {
    const attributes = [`uid=${node.id}`];

    if (node.role) {
      attributes.push(node.role === 'none' ? 'ignored' : node.role);
    }
    if (node.name) {
      attributes.push(`"${node.name}"`);
    }

    const extracted = this.#extractedAttributes(node);

    for (const attr of this.#sortedKeys(node)) {
      const mapped = booleanPropertyMap[attr];
      if (mapped && extracted[mapped]) {
        attributes.push(mapped);
      }

      const val = extracted[attr];
      if (val === true) {
        attributes.push(attr);
      } else if (typeof val === 'string' || typeof val === 'number') {
        attributes.push(`${attr}="${val}"`);
      }
    }

    return attributes;
  }

  #getAttributesMap(node: TextSnapshotNode): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    result.id = node.id;
    if (node.role) {
      result.role = node.role;
    }
    if (node.name) {
      result.name = node.name;
    }
    return {...result, ...this.#extractedAttributes(node)};
  }

  #sortedKeysCache = new WeakMap<TextSnapshotNode, string[]>();

  #sortedKeys(node: TextSnapshotNode): string[] {
    let cached = this.#sortedKeysCache.get(node);
    if (!cached) {
      cached = Object.keys(node)
        .filter(k => !excludedAttributes.has(k))
        .sort();
      this.#sortedKeysCache.set(node, cached);
    }
    return cached;
  }

  #extractedAttributes(node: TextSnapshotNode): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const attr of this.#sortedKeys(node)) {
      const value = (node as unknown as Record<string, unknown>)[attr];
      if (typeof value === 'boolean') {
        if (booleanPropertyMap[attr]) {
          result[booleanPropertyMap[attr]] = true;
        }
        if (value) {
          result[attr] = true;
        }
      } else if (typeof value === 'string' || typeof value === 'number') {
        result[attr] = value;
      }
    }
    return result;
  }
}

const booleanPropertyMap: Record<string, string> = {
  disabled: 'disableable',
  expanded: 'expandable',
  focused: 'focusable',
  selected: 'selectable',
};

const excludedAttributes = new Set([
  'id',
  'role',
  'name',
  'elementHandle',
  'children',
  'backendNodeId',
  'loaderId',
]);
