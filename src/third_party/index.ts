/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import 'core-js/modules/es.promise.with-resolvers.js';
import 'core-js/modules/es.set.union.v2.js';
import 'core-js/proposals/iterator-helpers.js';

export type {Options as YargsOptions} from 'yargs';
export {default as yargs} from 'yargs';
export {hideBin} from 'yargs/helpers';
export {default as debug} from 'debug';
export type {Debugger} from 'debug';
export {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
export {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
export {
  type CallToolResult,
  SetLevelRequestSchema,
  type ImageContent,
  type TextContent,
} from '@modelcontextprotocol/sdk/types.js';
export {z as zod} from 'zod';
export {
  Locator,
  PredefinedNetworkConditions,
  KnownDevices,
  CDPSessionEvent,
} from 'puppeteer-core';
export {default as puppeteer} from 'puppeteer-core';
export type * from 'puppeteer-core';
export type {CdpPage} from 'puppeteer-core/internal/cdp/Page.js';
export {
  resolveDefaultUserDataDir,
  detectBrowserPlatform,
  Browser as BrowserEnum,
  type ChromeReleaseChannel as BrowsersChromeReleaseChannel,
} from '@puppeteer/browsers';

export {snapshot} from './lighthouse-devtools-mcp-bundle.js';

export * as DevTools from '../../node_modules/chrome-devtools-frontend/mcp/mcp.js';
