/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../polyfill.js';

import process from 'node:process';

import {acquireEndpointLock, releaseEndpointLock} from '../browser.js';
import {createMcpServer, logDisclaimers} from '../index.js';
import {logger, saveLogsToFile} from '../logger.js';
import {computeFlagUsage} from '../telemetry/flagUtils.js';
import {StdioServerTransport} from '../third_party/index.js';
import {VERSION} from '../version.js';

import {cliOptions, parseArguments} from './chrome-devtools-mcp-cli-options.js';

export const args = parseArguments(VERSION);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;
if (
  process.env['CI'] ||
  process.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS']
) {
  console.error(
    "turning off usage statistics. process.env['CI'] || process.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS'] is set.",
  );
  args.usageStatistics = false;
}

if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] !== 'true') {
  process.on('unhandledRejection', (reason, promise) => {
    logger('Unhandled promise rejection', promise, reason);
  });
}

// Acquire endpoint lock early so stale instances are killed before we connect.
const lockedEndpoint = args.browserUrl ?? args.wsEndpoint;
if (lockedEndpoint) {
  acquireEndpointLock(lockedEndpoint);
}

// Clean up lock on exit. SIGTERM/SIGINT handlers must call process.exit()
// or the default exit behavior is suppressed and the process stays alive.
function cleanupAndExit() {
  if (lockedEndpoint) {
    releaseEndpointLock(lockedEndpoint);
  }
  process.exit(0);
}
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
process.on('exit', () => {
  if (lockedEndpoint) {
    releaseEndpointLock(lockedEndpoint);
  }
});

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);
const {server, clearcutLogger} = await createMcpServer(args, {
  logFile,
});
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
logDisclaimers(args);
void clearcutLogger?.logDailyActiveIfNeeded();
void clearcutLogger?.logServerStart(computeFlagUsage(args, cliOptions));
