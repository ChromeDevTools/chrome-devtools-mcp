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
  const attributes = [
    `uid=${serializedAXNodeRoot.id}`,
    serializedAXNodeRoot.role,
    `"${serializedAXNodeRoot.name || ''}"`, // Corrected: Added quotes around name
  ];

  // Value properties
  const valueProperties = [
    'value',
    'valuetext',
    'valuemin',
    'valuemax',
    'level',
    'autocomplete',
    'haspopup',
    'invalid',
    'orientation',
    'description',
    'keyshortcuts',
    'roledescription',
  ] as const;
  for (const property of valueProperties) {
    if (
      property in serializedAXNodeRoot &&
      serializedAXNodeRoot[property] !== undefined
    ) {
      attributes.push(`${property}="${serializedAXNodeRoot[property]}"`);
    }
  }

  // Boolean properties that also have an 'able' attribute
  const booleanPropertyMap = {
    disabled: 'disableable',
    expanded: 'expandable',
    focused: 'focusable',
    selected: 'selectable',
  };
  for (const [property, ableAttribute] of Object.entries(booleanPropertyMap)) {
    if (property in serializedAXNodeRoot) {
      attributes.push(ableAttribute);
      if (serializedAXNodeRoot[property as keyof typeof booleanPropertyMap]) {
        attributes.push(property);
      }
    }
  }

  const booleanProperties = [
    'modal',
    'multiline',
    'readonly',
    'required',
    'multiselectable',
  ] as const;

  for (const property of booleanProperties) {
    if (property in serializedAXNodeRoot && serializedAXNodeRoot[property]) {
      attributes.push(property);
    }
  }

  // Mixed boolean/string attributes
  for (const property of ['pressed', 'checked'] as const) {
    if (property in serializedAXNodeRoot) {
      attributes.push(property);
      if (serializedAXNodeRoot[property]) {
        attributes.push(`${property}="${serializedAXNodeRoot[property]}"`);
      }
    }
  }

  return attributes;
}
