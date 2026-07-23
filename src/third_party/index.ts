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
import {z as zod} from 'zod/v4';

export type {Flags, Result, RunnerResult, OutputMode};

export type {Options as YargsOptions} from 'yargs';
export {default as yargs} from 'yargs';
export {hideBin} from 'yargs/helpers';
export {default as semver} from 'semver';
export {default as debug} from 'debug';
export type {Debugger} from 'debug';
export {McpServer} from '@modelcontextprotocol/server';
export {
  StdioServerTransport,
  serveStdio,
} from '@modelcontextprotocol/server/stdio';
export {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
export {Client} from '@modelcontextprotocol/client';
export {
  type CallToolResult,
  type ImageContent,
  type TextContent,
  type Root,
} from '@modelcontextprotocol/server';
export {
  SetLevelRequestSchema,
  ListRootsRequestSchema,
  RootsListChangedNotificationSchema,
  ListRootsResultSchema,
} from '@modelcontextprotocol/core';
export {zod};
type InferZodOutput<V> = V extends undefined
  ? undefined
  : NonNullable<V> extends {_output: infer O}
    ? O | (undefined extends V ? undefined : never)
    : NonNullable<V> extends zod.ZodTypeAny
      ? zod.output<NonNullable<V>> | (undefined extends V ? undefined : never)
      : unknown;

export type ShapeOutput<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [
    K in keyof T as undefined extends InferZodOutput<T[K]> ? K : never
  ]?: InferZodOutput<T[K]>;
} & {
  [
    K in keyof T as undefined extends InferZodOutput<T[K]> ? never : K
  ]: InferZodOutput<T[K]>;
};
export {default as ajv} from 'ajv';
export {
  Locator,
  PredefinedNetworkConditions,
  KnownDevices,
  CDPSessionEvent,
} from 'puppeteer-core';
export {default as puppeteer} from 'puppeteer-core';
export type * from 'puppeteer-core';
export {PipeTransport} from 'puppeteer-core/internal/node/PipeTransport.js';
export type {CdpPage} from 'puppeteer-core/internal/cdp/Page.js';
export type {CdpWebWorker} from 'puppeteer-core/internal/cdp/WebWorker.js';
export type {Realm} from 'puppeteer-core/internal/api/Realm.js';
export type {JSONSchema7, JSONSchema7Definition} from 'json-schema';

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

import {
  snapshot as snapshotImpl,
  navigation as navigationImpl,
  generateReport as generateReportImpl,
} from './lighthouse-devtools-mcp-bundle.js';

export const snapshot = snapshotImpl as (
  page: Page,
  options: {flags?: Flags},
) => Promise<RunnerResult>;
export const navigation = navigationImpl as (
  page: Page,
  url: string,
  options: {flags?: Flags},
) => Promise<RunnerResult>;
export const generateReport = generateReportImpl as (
  lhr: Result,
  format: string,
) => string;

export * as DevTools from '../../node_modules/chrome-devtools-frontend/mcp/mcp.js';
