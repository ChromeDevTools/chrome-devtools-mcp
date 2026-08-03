/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../utils/logger.js';

/**
 * DevTools attaches a source map to every script a page parses, and keeps the
 * decoded mappings for the life of the model. On a script-heavy app that is
 * hundreds of downloads and gigabytes of retained mappings per page, none of
 * which we asked for: the only thing the MCP does with source maps is
 * symbolicate the handful of frames in a stack trace it is about to format.
 *
 * So resource loads made by the DevTools frontend are refused by default, and
 * a URL is allowed only for as long as it takes to attach the source map of a
 * script we actually need. Both load channels have to be gated, because
 * `PageResourceLoader.dispatchLoad()` falls back from the CDP loader to the
 * host bindings when the first one fails.
 */
const allowedUrls = new Set<string>();

/** Counts refusals per URL, for diagnostics only. */
const refused = new Map<string, number>();

export function allowResourceUrl(url: string): void {
  allowedUrls.add(url);
}

export function disallowResourceUrl(url: string): void {
  allowedUrls.delete(url);
}

export function isResourceUrlAllowed(url: string): boolean {
  return allowedUrls.has(url);
}

export function recordRefusedResourceUrl(url: string): void {
  refused.set(url, (refused.get(url) ?? 0) + 1);
  logger?.('Refused an on-demand DevTools resource load', url);
}

export function getRefusedResourceUrlsForTesting(): Map<string, number> {
  return new Map(refused);
}

export function resetSourceMapGateForTesting(): void {
  allowedUrls.clear();
  refused.clear();
}
