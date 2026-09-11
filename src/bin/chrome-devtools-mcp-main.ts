/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../utils/polyfill.js';

import process from 'node:process';

import {McpServer, logDisclaimers} from '../index.js';
import {McpHttpServer} from '../McpHttpServer.js';
import {ClearcutLogger} from '../telemetry/ClearcutLogger.js';
import {computeFlagUsage} from '../telemetry/flagUtils.js';
import {StdioServerTransport} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {logger, saveLogsToFile} from '../utils/logger.js';
import {VERSION} from '../version.js';

import {mcpOptions, parseArguments} from '../config/mcp-options.js';

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

// Shutdown on standard termination signals and, in stdio mode, on stdin EOF
// (stdio MCP convention — the client closes the transport to signal exit).
// Without this, an active Chrome subprocess keeps the Node event loop ref'd
// after stdin closes and the server hangs until something else kills it.
let shuttingDown = false;
const serverState: {server?: McpServer | McpHttpServer} = {};
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
  try {
    await serverState.server?.close();
  } catch (error) {
    logger?.('Failed to close server', error);
  }
  process.exit(0);
}
if (args.httpPort === undefined) {
  process.stdin.on('end', () => {
    void shutdown('stdin end');
  });
  process.stdin.on('close', () => {
    void shutdown('stdin close');
  });
}
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
if (args.httpPort !== undefined) {
  const httpServer = await McpHttpServer.start(args, {
    port: args.httpPort,
    host: args.httpHost,
    logFile,
  });
  serverState.server = httpServer;
  console.error(
    `chrome-devtools-mcp: MCP endpoint listening on ${httpServer.url}`,
  );
  logger?.(`Chrome DevTools MCP Server listening on ${httpServer.url}`);
} else {
  const initializedServer = await McpServer.from(args, {
    logFile,
  });
  serverState.server = initializedServer;
  const transport = new StdioServerTransport();
  await initializedServer.connect(transport);
  logger?.('Chrome DevTools MCP Server connected');
}
logDisclaimers(args);
void ClearcutLogger.get()?.logDailyActiveIfNeeded();
void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, mcpOptions));
