/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Modifications Copyright 2026 Colin (@cejor6)
 * - Optionally also start an HTTP transport (--http-port) sharing one
 *   browser with stdio. Graceful shutdown closes both transports.
 */

import '../polyfill.js';

import process from 'node:process';

import {closeBrowser} from '../browser.js';
import {
  type HttpTransportHandle,
  startHttpTransport,
} from '../HttpTransport.js';
import {createMcpServer, logDisclaimers} from '../index.js';
import {logger, saveLogsToFile} from '../logger.js';
import {ClearcutLogger} from '../telemetry/ClearcutLogger.js';
import {computeFlagUsage} from '../telemetry/flagUtils.js';
import {StdioServerTransport} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {VERSION} from '../version.js';

import {cliOptions, parseArguments} from './chrome-devtools-mcp-cli-options.js';

await checkForUpdates(
  'Run `npm install chrome-devtools-mcp@latest` to update.',
);

export const args = parseArguments(VERSION);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] !== 'true') {
  process.on('unhandledRejection', (reason, promise) => {
    logger('Unhandled promise rejection', promise, reason);
  });
}

let httpHandle: HttpTransportHandle | undefined;

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
  logger(`Shutting down (${reason})`);
  // Backstop in case browser teardown hangs (e.g. unresponsive Chrome,
  // slow beforeunload handlers, many tabs). Exits 0 because we still
  // honored the shutdown request; the log line preserves observability.
  // Unref'd so it doesn't keep the loop alive on the clean path.
  setTimeout(() => {
    logger('Shutdown timeout exceeded, forcing exit');
    process.exit(0);
  }, 10000).unref();
  if (httpHandle) {
    try {
      await httpHandle.close();
    } catch (e) {
      logger('Error closing HTTP transport', e);
    }
  }
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

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);
const {server, sharedState} = await createMcpServer(args, {
  logFile,
});
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');

if (args.httpPort !== undefined) {
  const host = (args.httpHost as string | undefined) ?? '127.0.0.1';
  httpHandle = await startHttpTransport({
    host,
    port: args.httpPort,
    token: args.httpToken,
    args,
    sharedState,
    logFile,
  });
  console.error(
    `HTTP transport listening on http://${host}:${args.httpPort}${
      args.httpToken ? ' (bearer auth required)' : ' (no auth)'
    }`,
  );
}

logDisclaimers(args);
void ClearcutLogger.get()?.logDailyActiveIfNeeded();
void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, cliOptions));
