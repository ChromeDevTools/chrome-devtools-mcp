/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ProfileScenario} from './types.ts';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

export function parseNonNegativeInteger(
  value: string | undefined,
  name: string,
): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

export function selectedPageIdFromToolResult(result: unknown): number {
  if (isObject(result) && isObject(result.structuredContent)) {
    const pages = result.structuredContent.pages;
    if (Array.isArray(pages)) {
      for (const page of pages) {
        if (
          isObject(page) &&
          page.selected === true &&
          typeof page.id === 'number'
        ) {
          return page.id;
        }
      }
    }
  }

  if (isObject(result) && Array.isArray(result.content)) {
    for (const content of result.content) {
      if (!isObject(content) || typeof content.text !== 'string') {
        continue;
      }
      const match = /^(\d+): .*\[selected\](?:\s|$)/m.exec(content.text);
      const pageId = match?.[1];
      if (pageId !== undefined) {
        return Number(pageId);
      }
    }
  }

  throw new Error(
    'new_page did not identify the selected page in its response',
  );
}

export function isScenarioModule(value: unknown): value is ProfileScenario {
  return isObject(value) && typeof value.get === 'function';
}
