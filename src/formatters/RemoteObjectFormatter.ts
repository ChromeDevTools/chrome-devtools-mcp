/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as DevTools from '../third_party/index.js';
import type {Protocol} from '../third_party/index.js';

const {StringUtilities} = DevTools.DevTools.Platform;

// Plain-text port of the preview rules in devtools-frontend's
// RemoteObjectPreviewFormatter (ui/legacy/components/object_ui), which only
// renders Lit templates. It formats the preview that CDP already attaches to
// console arguments, so nothing is evaluated in the page.

const MAX_DESCRIPTION_LENGTH = 400;

const PROMISE_STATE = '[[PromiseState]]';
const PROMISE_RESULT = '[[PromiseResult]]';
const GENERATOR_STATE = '[[GeneratorState]]';
const PRIMITIVE_VALUE = '[[PrimitiveValue]]';
const WEAK_REF_TARGET = '[[WeakRefTarget]]';

// Subtypes whose description is shown instead of a property preview.
const SUBTYPES_WITHOUT_VALUE_PREVIEW = new Set<string>([
  'arraybuffer',
  'dataview',
  'date',
  'error',
  'internal#entry',
  'null',
  'node',
  'regexp',
  'trustedtype',
  'webassemblymemory',
]);

function sortValue(property: Protocol.Runtime.PropertyPreview): number {
  switch (property.name) {
    case PROMISE_STATE:
      return 1;
    case PROMISE_RESULT:
      return 2;
    case GENERATOR_STATE:
    case PRIMITIVE_VALUE:
    case WEAK_REF_TARGET:
      return 3;
  }
  if (property.type !== 'function' && !property.name.startsWith('#')) {
    return 4;
  }
  return 5;
}

function formatName(name: string): string {
  return /^\s|\s$|^$|\n/.test(name) ? `"${name.replace(/\n/g, '↵')}"` : name;
}

function abbreviateClassName(description: string): string {
  const parts = description.split('.');
  if (parts.length === 1 && parts[0] === 'Object') {
    return '{…}';
  }
  return parts
    .map((part, i) =>
      i < parts.length - 1 ? StringUtilities.trimMiddle(part, 3) : part,
    )
    .join('.');
}

function formatPropertyValue(
  type: string,
  subtype: string | undefined,
  description = '',
): string {
  switch (type) {
    case 'accessor':
      return '(...)';
    case 'function':
      return 'ƒ';
    case 'string':
      return StringUtilities.formatAsJSLiteral(description);
    case 'object':
      return subtype ? description : abbreviateClassName(description);
    default:
      return description;
  }
}

function arrayLength(preview: Protocol.Runtime.ObjectPreview): number {
  const match = preview.description?.match(/[[(](\d+)[\])]$/);
  return match ? Number(match[1]) : 0;
}

function formatArrayItems(preview: Protocol.Runtime.ObjectPreview): string[] {
  const length = arrayLength(preview);
  const toIndex = (name: string): number => {
    const index = Number(name) >>> 0;
    return String(index) === name && index < length ? index : -1;
  };
  const indexed = preview.properties
    .filter(p => toIndex(p.name) !== -1)
    .sort((a, b) => toIndex(a.name) - toIndex(b.name));
  const others = preview.properties
    .filter(p => toIndex(p.name) === -1)
    .sort((a, b) => sortValue(a) - sortValue(b));

  // Gaps can be shown when all properties are guaranteed to be in the preview.
  const canShowGaps = !preview.overflow;
  const gap = (count: number): string =>
    count === 1 ? 'empty' : `empty × ${count}`;
  const items: string[] = [];
  let previous = -1;
  for (const property of indexed) {
    const index = toIndex(property.name);
    const value = formatPropertyValue(
      property.type,
      property.subtype,
      property.value,
    );
    if (canShowGaps) {
      if (index - previous > 1) {
        items.push(gap(index - previous - 1));
      }
      items.push(value);
    } else {
      items.push(index === items.length ? value : `${property.name}: ${value}`);
    }
    previous = index;
  }
  if (canShowGaps && length - previous > 1) {
    items.push(gap(length - previous - 1));
  }
  for (const property of others) {
    items.push(
      `${formatName(property.name)}: ${formatPropertyValue(property.type, property.subtype, property.value)}`,
    );
  }
  return items;
}

function formatObjectItems(preview: Protocol.Runtime.ObjectPreview): string[] {
  const properties = preview.properties
    .filter(p => p.type !== 'accessor')
    .sort((a, b) => sortValue(a) - sortValue(b));
  const items: string[] = [];
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const value = formatPropertyValue(
      property.type,
      property.subtype,
      property.value,
    );
    if (preview.subtype === 'promise' && property.name === PROMISE_STATE) {
      const result = properties.at(i + 1);
      if (result?.name === PROMISE_RESULT) {
        i++;
      }
      items.push(
        property.value !== 'pending' && result?.name === PROMISE_RESULT
          ? `<${property.value}>: ${formatPropertyValue(result.type, result.subtype, result.value)}`
          : `<${property.value}>`,
      );
    } else if (
      preview.subtype === 'generator' &&
      property.name === GENERATOR_STATE
    ) {
      items.push(`<${property.value}>`);
    } else if (property.name === PRIMITIVE_VALUE) {
      items.push(value);
    } else if (property.name === WEAK_REF_TARGET) {
      items.push(property.type === 'undefined' ? '<cleared>' : value);
    } else {
      items.push(`${formatName(property.name)}: ${value}`);
    }
  }
  return items;
}

function formatEntryItems(preview: Protocol.Runtime.ObjectPreview): string[] {
  return (preview.entries ?? []).map(({key, value}) => {
    const formattedValue = formatPropertyValue(
      value.type,
      value.subtype,
      value.description,
    );
    return key
      ? `${formatPropertyValue(key.type, key.subtype, key.description)} => ${formattedValue}`
      : formattedValue;
  });
}

/**
 * Formats a `Runtime.ObjectPreview` the way the DevTools console previews it,
 * for example `Map(1) {1 => 2}`, `(3) [1, 2, 3]` or `{a: 1, self: {…}}`.
 */
export function formatObjectPreview(
  preview: Protocol.Runtime.ObjectPreview,
): string {
  const description = preview.description ?? '';
  if (
    preview.type !== 'object' ||
    (preview.subtype && SUBTYPES_WITHOUT_VALUE_PREVIEW.has(preview.subtype))
  ) {
    return formatPropertyValue(preview.type, preview.subtype, description);
  }
  const isArray =
    preview.subtype === 'array' || preview.subtype === 'typedarray';
  let prefix = '';
  if (isArray) {
    const length = arrayLength(preview);
    const lengthText = length > 1 ? `(${length})` : '';
    const name = description.replace(/[[(]\d+[\])]$/, '');
    prefix = name === 'Array' ? lengthText : `${name}${lengthText}`;
  } else if (description !== 'Object') {
    prefix = description;
  }
  const items = preview.entries
    ? formatEntryItems(preview)
    : isArray
      ? formatArrayItems(preview)
      : formatObjectItems(preview);
  if (preview.overflow) {
    items.push('…');
  }
  const body = isArray ? `[${items.join(', ')}]` : `{${items.join(', ')}}`;
  return prefix ? `${prefix} ${body}` : body;
}

/**
 * Formats a console argument from the description and preview that CDP sends
 * with it.
 */
export function formatRemoteObject(
  remoteObject: Protocol.Runtime.RemoteObject,
): string {
  if (
    remoteObject.preview &&
    remoteObject.type === 'object' &&
    remoteObject.subtype !== 'node' &&
    remoteObject.subtype !== 'trustedtype'
  ) {
    return formatObjectPreview(remoteObject.preview);
  }
  if (remoteObject.type === 'string') {
    return String(remoteObject.value ?? '');
  }
  if (remoteObject.unserializableValue !== undefined) {
    return remoteObject.unserializableValue;
  }
  if (remoteObject.description !== undefined) {
    return StringUtilities.trimEndWithMaxLength(
      remoteObject.description,
      MAX_DESCRIPTION_LENGTH,
    );
  }
  return String(remoteObject.value);
}
