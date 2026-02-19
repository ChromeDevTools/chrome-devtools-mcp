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
  ElicitResultSchema,
  type ElicitResult,
  type ElicitRequestFormParams,
} from '@modelcontextprotocol/sdk/types.js';
export {z as zod} from 'zod';

import type {RequestHandlerExtra} from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {ServerRequest, ServerNotification} from '@modelcontextprotocol/sdk/types.js';

export type {RequestHandlerExtra, ServerRequest, ServerNotification};

/**
 * Convenience type for the `extra` context provided to tool callbacks by the MCP SDK.
 * Provides access to `sendRequest()` for elicitation and `sendNotification()` for logging.
 */
export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export * as DevTools from '../../node_modules/chrome-devtools-frontend/mcp/mcp.js';
