/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {TextSnapshotNode} from '../McpContext.js';

export function formatA11ySnapshot(
  serializedAXNodeRoot: TextSnapshotNode,
  depth = 0,
): string {
  let result = '';
  const attributes = getAttributes(serializedAXNodeRoot);
  const line = ' '.repeat(depth * 2) + attributes.join(' ') + '\n';
  result += line;

  for (const child of serializedAXNodeRoot.children) {
    result += formatA11ySnapshot(child, depth + 1);
  }

  return result;
}

function getAttributes(serializedAXNodeRoot: TextSnapshotNode): string[] {
  const attributes = [`uid=${serializedAXNodeRoot.id}`];
  if (serializedAXNodeRoot.role) {
    // To match representation in DevTools.
    attributes.push(
      serializedAXNodeRoot.role === 'none'
        ? 'ignored'
        : serializedAXNodeRoot.role,
    );
  }
  if (serializedAXNodeRoot.name) {
    attributes.push(`"${serializedAXNodeRoot.name}"`);
  }

  const excluded = new Set(['id', 'role', 'name', 'elementHandle', 'children']);

  const booleanPropertyMap: Record<string, string> = {
    disabled: 'disableable',
    expanded: 'expandable',
    focused: 'focusable',
    selected: 'selectable',
  };

  for (const attr of Object.keys(serializedAXNodeRoot).sort()) {
    if (excluded.has(attr)) {
      continue;
    }
    const value = (serializedAXNodeRoot as unknown as Record<string, unknown>)[
      attr
    ];
    if (typeof value === 'boolean') {
      if (booleanPropertyMap[attr]) {
        attributes.push(booleanPropertyMap[attr]);
      }
      if (value) {
        attributes.push(attr);
      }
    } else if (typeof value === 'string' || typeof value === 'number') {
      attributes.push(`${attr}="${value}"`);
    }
  }
  return attributes;
}
