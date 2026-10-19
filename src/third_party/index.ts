/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import 'core-js/modules/es.promise.with-resolvers.js';
import 'core-js/modules/es.set.union.v2.js';
import 'core-js/proposals/iterator-helpers.js';

import type {Flags, OutputMode, Result, RunnerResult} from 'lighthouse';
import type {Page} from 'puppeteer-core';
import {z as zod} from 'zod';

import type * as LighthouseBundle from './lighthouse-devtools-mcp-bundle.js';

export type {Flags, Result, RunnerResult, OutputMode};

export type {YargsOptions, InferredOptionTypes} from './cli.js';
export {yargs, hideBin, semver, PipeTransport} from './cli.js';
export {McpServer, type RegisteredTool} from '@modelcontextprotocol/server';
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
export {
  Accessibility,
  ConsoleMessage,
  Dialog,
  ElementHandle,
  Locator,
  PredefinedNetworkConditions,
  KnownDevices,
  CDPSession,
  CDPSessionEvent,
  Connection,
  ScreenRecorder,
  Target,
  TargetType,
  TimeoutError,
  Tracing,
  WebWorker,
  WebMCP,
  WebMCPTool,
} from 'puppeteer-core';
export {default as puppeteer} from 'puppeteer-core';
export type * from 'puppeteer-core';
export {CdpBrowser} from 'puppeteer-core/internal/cdp/Browser.js';
export {CdpFrame} from 'puppeteer-core/internal/cdp/Frame.js';
export {CdpPage} from 'puppeteer-core/internal/cdp/Page.js';
export {CdpScreenRecording} from 'puppeteer-core/internal/cdp/ScreenRecording.js';
export {CdpExtension} from 'puppeteer-core/internal/cdp/Extension.js';
export {CdpMouse} from 'puppeteer-core/internal/cdp/Input.js';
export type {CdpWebWorker} from 'puppeteer-core/internal/cdp/WebWorker.js';
export type {Realm} from 'puppeteer-core/internal/api/Realm.js';
export {FrameEvent} from 'puppeteer-core/internal/api/Frame.js';
export type {JSONSchema7, JSONSchema7Definition} from 'json-schema';
export {Mutex} from 'puppeteer-core/internal/util/Mutex.js';
export {
  DisposableStack,
  AsyncDisposableStack,
  SuppressedError,
} from 'puppeteer-core/internal/util/disposable.js';
export {
  resolveDefaultUserDataDir,
  detectBrowserPlatform,
  Browser as BrowserEnum,
  type ChromeReleaseChannel as BrowsersChromeReleaseChannel,
} from '@puppeteer/browsers';
export async function getToonEncode(): Promise<(val: unknown) => string> {
  const {encode} = await import('@toon-format/toon');
  return encode;
}
export async function getGcfEncode(): Promise<(val: unknown) => string> {
  const {encodeGeneric} = await import('@blackwell-systems/gcf');
  return encodeGeneric;
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

export const lighthouseRunner = {
  async snapshot(page: Page, options: {flags?: Flags}): Promise<RunnerResult> {
    const {snapshot} = await loadLighthouse();
    return await snapshot(page, options);
  },
  async navigation(
    page: Page,
    url: string,
    options: {flags?: Flags},
  ): Promise<RunnerResult> {
    const {navigation} = await loadLighthouse();
    return await navigation(page, url, options);
  },
};

export async function generateReport(
  lhr: Result,
  format: string,
): Promise<string> {
  const lighthouse = await loadLighthouse();
  return lighthouse.generateReport(lhr, format);
}

export * as DevTools from '../../third_party/devtools-frontend/mcp/mcp.js';
