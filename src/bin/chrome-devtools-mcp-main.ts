/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../utils/polyfill.js';

import process from 'node:process';

import {closeBrowser} from '../browser.js';
import {createMcpServer, logDisclaimers} from '../index.js';
import {ClearcutLogger} from '../telemetry/ClearcutLogger.js';
import {computeFlagUsage} from '../telemetry/flagUtils.js';
import {StdioServerTransport} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {logger, saveLogsToFile} from '../utils/logger.js';
import {VERSION} from '../version.js';

// GlobalCheck Integration: Import compliance wrapper and MCP server type
import type {IMcpServer} from '@modelcontextprotocol/sdk';
import {GlobalCheckMcpWrapper} from '@globalcheck/mcp-server-wrapper';

import {cliOptions, parseArguments} from './chrome-devtools-mcp-cli-options.js';

await checkForUpdates(
  'Run `npm install chrome-devtools-mcp@latest` to update.',
);

export const args = parseArguments(VERSION);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] !== 'true') {
  process.on('unhandledRejection', (reason, promise) => {
    logger?.('Unhandled promise rejection', promise, reason);
  });
}

// Shutdown on stdin EOF (stdio MCP convention — the client closes the
// transport to signal exit) and on standard termination signals. Without
// this, an active Chrome subprocess keeps the Node event loop ref'd after
// stdin closes and the server hangs until something else kills it.
let shuttingDown = false;
async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger?.(`Shutting down (${reason})`);
  // Backstop in case browser teardown hangs (e.g. unresponsive Chrome,
  // slow beforeunload handlers, many tabs). Exits 0 because we still
  // honored the shutdown request; the log line preserves observability.
  // Unref'd so it doesn't keep the loop alive on the clean path.
  setTimeout(() => {
    logger?.('Shutdown timeout exceeded, forcing exit');
    process.exit(0);
  }, 10000).unref();
  await closeBrowser();
  process.exit(0);
}
process.stdin.on('end', () => {
  void shutdown('stdin end');
});
process.stdin.on('close', () => {
  void shutdown('stdin close');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGHUP', () => {
  void shutdown('SIGHUP');
});

logger?.(`Starting Chrome DevTools MCP Server v${VERSION}`);
const {server} = await createMcpServer(args, {
  logFile,
});

let mcpServer: IMcpServer = server;
// GlobalCheck Integration: Conditionally wrap the MCP server with GlobalCheck for compliance.
// Set CHROME_DEVTOOLS_MCP_ENABLE_GLOBALCHECK=true to enable.
// Optionally, configure policyId via GLOBALCHECK_POLICY_ID environment variable.
if (process.env.CHROME_DEVTOOLS_MCP_ENABLE_GLOBALCHECK === 'true') {
  logger?.('GlobalCheck enabled: Wrapping Chrome DevTools MCP server with compliance layer.');
  mcpServer = new GlobalCheckMcpWrapper(server, {
    policyId: process.env.GLOBALCHECK_POLICY_ID || 'chrome-devtools-mcp-default',
  });
}

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
logger?.('Chrome DevTools MCP Server connected');
logDisclaimers(args);
void ClearcutLogger.get()?.logDailyActiveIfNeeded();
void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, cliOptions));
