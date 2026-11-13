/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import 'core-js/modules/es.promise.with-resolvers.js';
import 'core-js/modules/es.set.union.v2.js';
import 'core-js/proposals/iterator-helpers.js';

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import type {Flags, OutputMode, Result, RunnerResult} from 'lighthouse';
import type {Page} from 'puppeteer-core';

// eslint-disable-next-line no-restricted-imports
import * as DevToolsRoot from '../../third_party/devtools-frontend/front_end/core/root/root.js';

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
export {
  Accessibility,
  ConsoleMessage,
  Dialog,
  ElementHandle,
  Frame,
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
export {CdpHTTPRequest} from 'puppeteer-core/internal/cdp/HTTPRequest.js';
export {CdpPage} from 'puppeteer-core/internal/cdp/Page.js';
export {CdpScreenRecording} from 'puppeteer-core/internal/cdp/ScreenRecording.js';
export {CdpExtension} from 'puppeteer-core/internal/cdp/Extension.js';
export {CdpMouse} from 'puppeteer-core/internal/cdp/Input.js';
export type {CdpWebWorker} from 'puppeteer-core/internal/cdp/WebWorker.js';
export type {Realm} from 'puppeteer-core/internal/api/Realm.js';
export {FrameEvent} from 'puppeteer-core/internal/api/Frame.js';
export type {JSONSchema7, JSONSchema7Definition} from 'json-schema';
export {Mutex} from 'puppeteer-core/internal/util/Mutex.js';
export {Deferred} from 'puppeteer-core/internal/util/Deferred.js';
export {
  DisposableStack,
  AsyncDisposableStack,
  SuppressedError,
} from 'puppeteer-core/internal/util/disposable.js';
export {PUPPETEER_REVISIONS} from 'puppeteer-core/internal/revisions.js';
export {
  computeExecutablePath,
  resolveDefaultUserDataDir,
  detectBrowserPlatform,
  Browser as BrowserEnum,
  type ChromeReleaseChannel as BrowsersChromeReleaseChannel,
} from '@puppeteer/browsers';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEncoder(value: unknown): value is (val: unknown) => string {
  return typeof value === 'function';
}

function findForAgentsPackageJson(): string | undefined {
  const normalizedDir = import.meta.dirname.replaceAll('\\', '/');
  if (
    normalizedDir.includes('/node_modules/') ||
    !normalizedDir.includes('/for_agents/')
  ) {
    return undefined;
  }
  let dir = import.meta.dirname;
  while (true) {
    for (const rel of [
      'for_agents/package.json',
      'third_party/devtools-frontend/src/for_agents/package.json',
    ]) {
      const candidate = path.join(dir, rel);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

async function importOptionalPeer(
  specifier: string,
  loader: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  let mod: unknown;
  try {
    mod = await loader();
  } catch (error) {
    const pkgJson = findForAgentsPackageJson();
    if (!pkgJson) {
      throw error;
    }
    try {
      const resolved = createRequire(pkgJson).resolve(specifier);
      mod = await import(pathToFileURL(resolved).href);
    } catch {
      throw error;
    }
  }
  if (!isRecord(mod)) {
    throw new Error(`Invalid module export for ${specifier}`);
  }
  return isRecord(mod['default']) ? {...mod['default'], ...mod} : mod;
}

export async function getToonEncode(): Promise<(val: unknown) => string> {
  const mod = await importOptionalPeer(
    '@toon-format/toon',
    async () => await import('@toon-format/toon'),
  );
  const encode = mod['encode'];
  if (!isEncoder(encode)) {
    throw new Error('Missing encode export in @toon-format/toon');
  }
  return encode;
}

export async function getGcfEncode(): Promise<(val: unknown) => string> {
  const mod = await importOptionalPeer(
    '@blackwell-systems/gcf',
    async () => await import('@blackwell-systems/gcf'),
  );
  const encodeGeneric = mod['encodeGeneric'];
  if (!isEncoder(encodeGeneric)) {
    throw new Error('Missing encodeGeneric export in @blackwell-systems/gcf');
  }
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

DevToolsRoot.Runtime.experiments.register({
  name: DevToolsRoot.ExperimentNames.ExperimentName.INSTRUMENTATION_BREAKPOINTS,
  title: 'Instrumentation breakpoints',
  aboutFlag: 'devtools-instrumentation-breakpoints',
  isEnabled: false,
  requiresChromeRestart: false,
});

export * as DevTools from '../../third_party/devtools-frontend/mcp/mcp.js';
