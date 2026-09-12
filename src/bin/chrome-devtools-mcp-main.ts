/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../utils/polyfill.js';

import process from 'node:process';

import {closeBrowser} from '../browser.js';
import {startMcpHttpServer, type McpHttpServer} from '../http-server.js';
import {McpServer, logDisclaimers} from '../index.js';
import {runStdioProxy} from '../proxy.js';
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
const serverUrl = args.serverUrl ? new URL(args.serverUrl) : undefined;
const isHttpMode = serverUrl === undefined && args.httpPort !== undefined;
const isProxyMode = serverUrl !== undefined;

if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] !== 'true') {
  process.on('unhandledRejection', (reason, promise) => {
    logger?.('Unhandled promise rejection', promise, reason);
  });
}

let shuttingDown = false;
let httpServer: McpHttpServer | undefined;
let stdioServer: McpServer | undefined;
let proxyPromise: Promise<void> | undefined;

// Shutdown on stdin EOF (stdio MCP convention — the client closes the
// transport to signal exit) and on standard termination signals. Without
// this, an active Chrome subprocess keeps the Node event loop ref'd after
// stdin closes and the server hangs until something else kills it.
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

  if (httpServer !== undefined) {
    await httpServer.close().catch(error => {
      logger?.('Failed to close HTTP server', error);
    });
  }
  if (stdioServer !== undefined) {
    await stdioServer.close().catch(error => {
      logger?.('Failed to close stdio MCP server', error);
    });
  }
  if (isProxyMode) {
    // The proxy owns stdin's lifecycle. Destroying it wakes its EOF/close
    // handler so the remote session is terminated before this process exits.
    process.stdin.destroy();
    await proxyPromise?.catch(error => {
      logger?.('Failed to close stdio proxy', error);
    });
  }
  await closeBrowser();
  process.exit(0);
}

if (!isHttpMode) {
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

if (isProxyMode) {
  proxyPromise = runStdioProxy(serverUrl);
  await proxyPromise;
  await shutdown('stdio proxy closed');
} else if (args.httpPort !== undefined) {
  httpServer = await startMcpHttpServer(args, {
    port: args.httpPort,
    logFile,
  });
  logger?.(`Chrome DevTools MCP Server listening at ${httpServer.url.href}`);
  logDisclaimers(args);
} else {
  stdioServer = await McpServer.from(args, {
    logFile,
  });
  const transport = new StdioServerTransport();
  await stdioServer.connect(transport);
  logger?.('Chrome DevTools MCP Server connected');
  logDisclaimers(args);
  void ClearcutLogger.get()?.logDailyActiveIfNeeded();
  void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, mcpOptions));
}
