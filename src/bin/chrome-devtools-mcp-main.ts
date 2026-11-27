/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../utils/polyfill.js';

import process from 'node:process';

import {BrowserManager} from '../BrowserManager.js';
import {HttpServer} from '../http/HttpServer.js';
import {McpServer} from '../index.js';
import {ClearcutLogger} from '../telemetry/ClearcutLogger.js';
import {computeFlagUsage} from '../telemetry/flagUtils.js';
import {StdioServerTransport} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {logDisclaimers} from '../utils/disclaimers.js';
import {logger, saveLogsToFile} from '../utils/logger.js';
import {setupUnhandledRejectionHandler} from '../utils/errorHandling.js';
import {VERSION} from '../version.js';

import {mcpOptions} from '../config/mcp-options.js';
import {ConfigParser} from '../config/ConfigParser.js';

await checkForUpdates(
  'Run `npm install chrome-devtools-mcp@latest` to update.',
);

const configParser = new ConfigParser(VERSION);
const serverConfig = configParser.parseConfig();
const args = serverConfig.resolved;

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

setupUnhandledRejectionHandler(() => {
  process.exit(1);
});

logger?.(`Starting Chrome DevTools MCP Server v${VERSION}`);
const browserManager = new BrowserManager(serverConfig, {
  logFile,
});
const serverPromise = McpServer.from(serverConfig, {
  browserManager,
});

// Shutdown on standard termination signals (and on stdin EOF in stdio mode,
// where the client closes the transport to signal exit). Without this, an
// active Chrome subprocess keeps the Node event loop ref'd and the server
// hangs until something else kills it.
let httpServer: HttpServer | undefined;
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
  await httpServer?.close();
  const server = await serverPromise;
  await server.close();
  process.exit(0);
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
if (args.transport !== 'http') {
  process.stdin.on('end', () => {
    void shutdown('stdin end');
  });
  process.stdin.on('close', () => {
    void shutdown('stdin close');
  });
}

const server = await serverPromise;
if (args.transport === 'http') {
  if (args.watchConfig) {
    server.watchConfig();
  }
  httpServer = new HttpServer(server, {
    host: args.host,
    port: args.port,
    allowedHosts: args.allowedHosts,
    allowedOrigins: args.allowedOrigins,
    httpToken: args.httpToken,
    allowUnauthenticatedHttp: args.allowUnauthenticatedHttp,
    onerror: err => {
      logger?.('HTTP transport error:', err);
    },
  });
  const address = await httpServer.start();
  if (shuttingDown) {
    await httpServer.close();
  } else {
    logger?.(`Chrome DevTools MCP HTTP server listening on ${address.url}`);
    console.error(
      `Chrome DevTools MCP HTTP server listening on ${address.url}`,
    );
  }
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger?.('Chrome DevTools MCP Server connected');
}
logDisclaimers(args);
void ClearcutLogger.get()?.logDailyActiveIfNeeded();
void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, mcpOptions));
