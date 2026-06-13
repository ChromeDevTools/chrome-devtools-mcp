/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../polyfill.js';

import process from 'node:process';

import {closeBrowser} from '../browser.js';
import {startChatGptHttpServer} from '../chatgpt-http-server.js';
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
    logger?.('Unhandled promise rejection', promise, reason);
  });
}

const shutdownTasks: Array<() => Promise<void>> = [];
let shuttingDown = false;
async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger?.(`Shutting down (${reason})`);
  setTimeout(() => {
    logger?.('Shutdown timeout exceeded, forcing exit');
    process.exit(0);
  }, 10000).unref();

  for (const task of shutdownTasks) {
    try {
      await task();
    } catch (error) {
      logger?.('Shutdown task failed', error);
    }
  }
  await closeBrowser();
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

if (args.chatgpt) {
  logger?.(`Starting Chrome DevTools MCP ChatGPT HTTP Server v${VERSION}`);
  const httpServer = await startChatGptHttpServer(args, {logFile});
  shutdownTasks.push(httpServer.close);
  logger?.(`Chrome DevTools MCP ChatGPT HTTP Server listening at ${httpServer.url}`);
} else {
  // Shutdown on stdin EOF (stdio MCP convention — the client closes the
  // transport to signal exit). Without this, an active Chrome subprocess keeps
  // the Node event loop ref'd after stdin closes and the server hangs until
  // something else kills it.
  process.stdin.on('end', () => {
    void shutdown('stdin end');
  });
  process.stdin.on('close', () => {
    void shutdown('stdin close');
  });

  logger?.(`Starting Chrome DevTools MCP Server v${VERSION}`);
  const {server} = await createMcpServer(args, {
    logFile,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  shutdownTasks.push(async () => {
    await transport.close();
    await server.close();
  });
  logger?.('Chrome DevTools MCP Server connected');
}

logDisclaimers(args);
void ClearcutLogger.get()?.logDailyActiveIfNeeded();
void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, cliOptions));
