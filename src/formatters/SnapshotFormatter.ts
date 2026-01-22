/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TextSnapshot, TextSnapshotNode} from '../McpContext.js';

export class SnapshotFormatter {
  #snapshot: TextSnapshot;

  constructor(snapshot: TextSnapshot) {
    this.#snapshot = snapshot;
  }

  toString(): string {
    const chunks: string[] = [];
    const root = this.#snapshot.root;

    // Top-level content of the snapshot.
    if (
      this.#snapshot.verbose &&
      this.#snapshot.hasSelectedElement &&
      !this.#snapshot.selectedElementUid
    ) {
      chunks.push(`Note: there is a selected element in the DevTools Elements panel but it is not included into the current a11y tree snapshot.
Get a verbose snapshot to include all elements if you are interested in the selected element.\n\n`);
    }

    chunks.push(this.#formatNode(root, 0));
    return chunks.join('');
  }

  toJSON(): object {
    return this.#nodeToJSON(this.#snapshot.root);
  }

  #formatNode(node: TextSnapshotNode, depth = 0): string {
    const chunks: string[] = [];
    const attributes = this.#getAttributes(node);
    const line =
      ' '.repeat(depth * 2) +
      attributes.join(' ') +
      (node.id === this.#snapshot.selectedElementUid
        ? ' [selected in the DevTools Elements panel]'
        : '') +
      '\n';
    chunks.push(line);

    for (const child of node.children) {
      chunks.push(this.#formatNode(child, depth + 1));
    }
    return chunks.join('');
  }

  #nodeToJSON(node: TextSnapshotNode): object {
    const rawAttrs = this.#getAttributesMap(node);
    const children = node.children.map(child => this.#nodeToJSON(child));
    const result: Record<string, unknown> = structuredClone(rawAttrs);
    if (children.length > 0) {
      result.children = children;
    }
    return result;
  }

  #getAttributes(serializedAXNodeRoot: TextSnapshotNode): string[] {
    const attributes = [`uid=${serializedAXNodeRoot.id}`];

    if (serializedAXNodeRoot.role) {
      attributes.push(
        serializedAXNodeRoot.role === 'none'
          ? 'ignored'
          : serializedAXNodeRoot.role,
      );
    }
    if (serializedAXNodeRoot.name) {
      attributes.push(`"${serializedAXNodeRoot.name}"`);
    }

    const simpleAttrs = this.#getAttributesMap(
      serializedAXNodeRoot,
      /* excludeSpecial */ true,
    );

    for (const attr of Object.keys(serializedAXNodeRoot).sort()) {
      if (excludedAttributes.has(attr)) {
        continue;
      }

      const mapped = booleanPropertyMap[attr];
      if (mapped && simpleAttrs[mapped]) {
        attributes.push(mapped);
      }

      const val = simpleAttrs[attr];
      if (val === true) {
        attributes.push(attr);
      } else if (typeof val === 'string' || typeof val === 'number') {
        attributes.push(`${attr}="${val}"`);
      }
    }

    return attributes;
  }

  #getAttributesMap(
    node: TextSnapshotNode,
    excludeSpecial = false,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!excludeSpecial) {
      result.id = node.id;
      if (node.role) {
        result.role = node.role;
      }
      if (node.name) {
        result.name = node.name;
      }
    }

    // Re-implementing the exact logic from original function for #getAttributes to be safe:
    return {
      ...result,
      ...this.#extractedAttributes(node),
    };
  }

  #extractedAttributes(node: TextSnapshotNode): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const attr of Object.keys(node).sort()) {
      if (excludedAttributes.has(attr)) {
        continue;
      }
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
