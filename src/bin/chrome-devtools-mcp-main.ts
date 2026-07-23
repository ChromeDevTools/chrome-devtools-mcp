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
import {serveStdio} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {logger, saveLogsToFile} from '../utils/logger.js';
import {VERSION} from '../version.js';

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
  }, 5000).unref();
  await closeBrowser();
  process.exit(0);
}
for (const event of ['end', 'close'] as const) {
  process.stdin.on(event, () => {
    void shutdown(`stdin ${event}`);
  });
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

logger?.(`Starting Chrome DevTools MCP Server v${VERSION}`);
const {server} = await createMcpServer(args, {
  logFile,
});
logDisclaimers(args);
void ClearcutLogger.get()?.logDailyActiveIfNeeded();
void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, cliOptions));

serveStdio(() => server);
logger?.('Chrome DevTools MCP Server connected via serveStdio');
