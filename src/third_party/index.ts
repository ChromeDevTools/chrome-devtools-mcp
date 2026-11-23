/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// The light bundle that the server loads at startup: MCP SDK, zod, ajv and
// small modules. Puppeteer and DevTools frontend code belong in browser.ts,
// which loadBrowser() loads on first use.
import 'core-js/modules/es.promise.with-resolvers.js';
import 'core-js/modules/es.set.union.v2.js';
import 'core-js/proposals/iterator-helpers.js';

import type {Flags, OutputMode, Result, RunnerResult} from 'lighthouse';
import type {Page} from 'puppeteer-core';

import type * as BrowserBundle from './browser.js';
import type * as LighthouseBundle from './lighthouse-devtools-mcp-bundle.js';
import * as zod from './zod.js';

export type {Flags, Result, RunnerResult, OutputMode};

export type {YargsOptions, InferredOptionTypes} from './cli.js';
export {yargs, hideBin, semver, PipeTransport} from './cli.js';
export {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type RegisteredTool,
} from '@modelcontextprotocol/server';
export {
  StdioServerTransport,
  serveStdio,
} from '@modelcontextprotocol/server/stdio';
export type {Transport} from '@modelcontextprotocol/server';
export {
  type CallToolResult,
  type ImageContent,
  type TextContent,
  type Tool,
  type Root,
} from '@modelcontextprotocol/server';
export {
  SetLevelRequestSchema,
  ListRootsRequestSchema,
  RootsListChangedNotificationSchema,
  ListRootsResultSchema,
} from '@modelcontextprotocol/core';
export {zod};
export type ShapeOutput<T extends zod.ZodRawShape> = zod.output<
  zod.ZodObject<T>
>;

export {default as ajv} from 'ajv';
export type {JSONSchema7, JSONSchema7Definition} from 'json-schema';
export {
  DisposableStack,
  AsyncDisposableStack,
  SuppressedError,
} from 'puppeteer-core/internal/util/disposable.js';
export {PredefinedNetworkConditions} from 'puppeteer-core/internal/cdp/PredefinedNetworkConditions.js';
// eslint-disable-next-line no-restricted-imports
export * as StringUtilities from '../../third_party/devtools-frontend/front_end/core/platform/StringUtilities.js';
// eslint-disable-next-line no-restricted-imports
export * as Debouncer from '../../third_party/devtools-frontend/front_end/core/common/Debouncer.js';
export async function getToonEncode(): Promise<(val: unknown) => string> {
  const {encode} = await import('@toon-format/toon');
  return encode;
}
export async function getGcfEncode(): Promise<(val: unknown) => string> {
  const {encodeGeneric} = await import('@blackwell-systems/gcf');
  return encodeGeneric;
}

let browserBundle: Promise<typeof BrowserBundle> | undefined;

/**
 * Loads the Puppeteer and DevTools bundle on first use, so that modules which
 * only need it inside tool handlers can be imported without it.
 */
export function loadBrowser(): Promise<typeof BrowserBundle> {
  browserBundle ??= import('./browser.js');
  return browserBundle;
}

let lighthouseBundle: Promise<typeof LighthouseBundle> | undefined;

/**
 * Loads the Lighthouse bundle on first use. The bundle is large and only the
 * Lighthouse tool uses it, so a static import slows down every process start.
 */
function loadLighthouse(): Promise<typeof LighthouseBundle> {
  lighthouseBundle ??= import('./lighthouse-devtools-mcp-bundle.js');
  return lighthouseBundle;
}

export async function lighthouseSnapshot(
  page: Page,
  options: {flags?: Flags},
): Promise<RunnerResult | undefined> {
  const {snapshot} = await loadLighthouse();
  return await snapshot(page, options);
}

export async function lighthouseNavigation(
  page: Page,
  url: string,
  options: {flags?: Flags},
): Promise<RunnerResult | undefined> {
  const {navigation} = await loadLighthouse();
  return await navigation(page, url, options);
}

export async function generateReport(
  lhr: Result,
  format: OutputMode,
): Promise<string> {
  const lighthouse = await loadLighthouse();
  return lighthouse.generateReport(lhr, format);
}
