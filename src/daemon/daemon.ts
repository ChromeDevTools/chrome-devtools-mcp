#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../utils/polyfill.js';

import fs, {constants, openSync, writeSync, closeSync} from 'node:fs';
import {createServer, type Server} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {BrowserManager} from '../BrowserManager.js';
import {mcpOptions, parseArguments} from '../config/mcp-options.js';
import {McpServer} from '../index.js';
import {ClearcutLogger} from '../telemetry/ClearcutLogger.js';
import {computeFlagUsage} from '../telemetry/flagUtils.js';
import {PipeTransport} from '../third_party/index.js';
import {logger, puppeteerLogger, saveLogsToFile} from '../utils/logger.js';
import {VERSION} from '../version.js';

import type {DaemonMessage, DaemonStatusResult} from './types.js';
import {
  DAEMON_CLIENT_NAME,
  getPidFilePath,
  getSocketPath,
  IS_WINDOWS,
  isDaemonRunning,
  assertValidSessionId,
} from './utils.js';

const sessionId = process.env.CHROME_DEVTOOLS_MCP_SESSION_ID || '';
assertValidSessionId(sessionId);
logger?.(`Daemon sessionId: ${sessionId}`);
if (isDaemonRunning(sessionId)) {
  logger?.('Another daemon process is running.');
  process.exit(1);
}
const pidFilePath = getPidFilePath(sessionId);
const pidDir = path.dirname(pidFilePath);
const currentUserUid = os.userInfo().uid;

try {
  fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
  if (os.platform() !== 'win32') {
    // POSIX specific checks
    try {
      const stats = fs.statSync(pidDir);

      // 1. Check Ownership: Ensure the directory is owned by the current user.
      if (stats.uid !== currentUserUid) {
        console.error(
          `[MCP Daemon] Critical error: PID directory ${pidDir} is not owned by the current user (Expected: ${currentUserUid}, Found: ${stats.uid}). Possible tampering.`,
        );
        process.exit(1);
      }

      // 2. Check Permissions: Ensure the directory is not group or world-writable.
      // Mode is a number, e.g., 0o700. We check if bits for group/world write are set.
      const mode = stats.mode;
      if (mode & constants.S_IWGRP || mode & constants.S_IWOTH) {
        console.error(
          `[MCP Daemon] Critical error: PID directory ${pidDir} has insecure permissions (Mode: ${mode.toString(8)}). It should not be writable by group or others.`,
        );
        process.exit(1);
      }
    } catch (statErr) {
      console.error(
        `[MCP Daemon] Critical error stating PID directory ${pidDir}:`,
        statErr,
      );
      process.exit(1);
    }
  }
} catch (err) {
  console.error(
    `[MCP Daemon] Critical error creating/validating PID directory: ${pidDir}`,
    err,
  );
  process.exit(1);
}

let fd = -1;
try {
  // Open the file with flags to:
  // - O_WRONLY: Write-only
  // - O_CREAT: Create if it doesn't exist
  // - O_TRUNC: Truncate to zero length if it exists
  // - O_NOFOLLOW: DO NOT follow symlinks.
  // - 0o600: Permissions: read/write for owner, no permissions for others.
  fd = openSync(
    pidFilePath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o600,
  );
  writeSync(fd, process.pid.toString());
} catch (err) {
  console.error(
    `[MCP Daemon] Critical error writing PID file: ${pidFilePath}`,
    err,
  );
  // If openSync fails due to O_NOFOLLOW on a symlink, the error will be caught here.
  process.exit(1);
} finally {
  if (fd !== -1) {
    try {
      closeSync(fd);
    } catch (err) {
      console.error(`[MCP Daemon] Error closing PID file: ${pidFilePath}`, err);
    }
  }
}
logger?.(`Writing ${process.pid.toString()} to ${pidFilePath}`);

const socketPath = getSocketPath(sessionId);

const startDate = new Date();
const mcpServerArgs = process.argv.slice(2);

let mcpServer: McpServer | null = null;
let server: Server | null = null;

async function setupMCPServer() {
  logger?.(`Starting Chrome DevTools MCP Server v${VERSION}`);
  const args = parseArguments(VERSION);
  const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;
  const browserManager = new BrowserManager(args, {
    logFile,
  });
  mcpServer = await McpServer.from(args, {
    browserManager,
    logFile,
  });
  ClearcutLogger.get()?.setClientName(DAEMON_CLIENT_NAME);
  void ClearcutLogger.get()?.logDailyActiveIfNeeded();
  void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, mcpOptions));
}

async function handleRequest(msg: DaemonMessage) {
  try {
    if (msg.method === 'invoke_tool') {
      await started;
      if (!mcpServer) {
        throw new Error('MCP server not initialized');
      }
      const {tool, args} = msg;

      const result = await mcpServer.callTool(tool, args);

      return {
        success: true,
        result: JSON.stringify(result),
      };
    } else if (msg.method === 'stop') {
      // Ensure we are not interrupting in-progress starting.
      await started;
      // Trigger cleanup asynchronously.
      setImmediate(() => {
        void cleanup();
      });
      return {
        success: true,
        message: 'stopping',
      };
    } else if (msg.method === 'status') {
      await started;
      const statusResult: DaemonStatusResult = {
        pid: process.pid,
        socketPath,
        startDate: startDate.toISOString(),
        version: VERSION,
        args: mcpServerArgs,
      };
      return {
        success: true,
        result: JSON.stringify(statusResult),
      };
    }
    {
      return {
        success: false,
        error: `Unknown method: ${JSON.stringify(msg, null, 2)}`,
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function startSocketServer() {
  // Remove existing socket file if it exists (only on non-Windows)
  if (!IS_WINDOWS) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // ignore errors.
    }
  }

  return await new Promise<void>((resolve, reject) => {
    server = createServer(socket => {
      const transport = new PipeTransport(socket, socket, puppeteerLogger);
      transport.onmessage = async (message: string) => {
        logger?.('onmessage', message);
        const response = await handleRequest(JSON.parse(message));
        transport.send(JSON.stringify(response));
        socket.end();
      };
      socket.on('error', error => {
        logger?.('Socket error:', error);
      });
    });

    server.listen(
      {
        path: socketPath,
        readableAll: false,
        writableAll: false,
      },
      async () => {
        console.log(`Daemon server listening on ${socketPath}`);

        try {
          await setupMCPServer();
          resolve();
        } catch (err) {
          reject(err);
        }
      },
    );

    server.on('error', error => {
      logger?.('Server error:', error);
      reject(error);
    });
  });
}

async function cleanup(exitCode = 0) {
  console.log('Cleaning up daemon...');

  try {
    await mcpServer?.close();
  } catch (error) {
    logger?.('Error closing MCP server:', error);
  }
  if (server) {
    await new Promise<void>(resolve => {
      server!.close(() => resolve());
    });
  }
  if (!IS_WINDOWS) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // ignore errors
    }
  }
  logger?.(`unlinking ${pidFilePath}`);
  if (fs.existsSync(pidFilePath)) {
    fs.unlinkSync(pidFilePath);
  }
  process.exit(exitCode);
}

// Handle shutdown signals
process.on('SIGTERM', () => {
  void cleanup();
});
process.on('SIGINT', () => {
  void cleanup();
});
process.on('SIGHUP', () => {
  void cleanup();
});

// Handle uncaught errors
process.on('uncaughtException', error => {
  logger?.('Uncaught exception:', error);
  void cleanup(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger?.('Unhandled promise rejection', promise, reason);
  if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] === 'true') {
    void cleanup(1);
  }
});

// Start the server
const started = startSocketServer().catch(error => {
  logger?.('Failed to start daemon server:', error);
  void cleanup(1);
});
