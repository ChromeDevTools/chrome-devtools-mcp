#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs, {constants, openSync, writeSync, closeSync} from 'node:fs';
import {createServer, type Server} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  Client,
  PipeTransport,
  StdioClientTransport,
} from '../third_party/index.js';
import {logger} from '../utils/logger.js';
import {VERSION} from '../version.js';

import type {DaemonMessage} from './types.js';
import {
  DAEMON_CLIENT_NAME,
  getPidFilePath,
  getSocketPath,
  INDEX_SCRIPT_PATH,
  IS_WINDOWS,
  isDaemonRunning,
} from './utils.js';

const sessionId = process.env.CHROME_DEVTOOLS_MCP_SESSION_ID || '';
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

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let server: Server | null = null;

async function setupMCPClient() {
  console.log('Setting up MCP client connection...');

  // Create stdio transport for chrome-devtools-mcp
  mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [INDEX_SCRIPT_PATH, ...mcpServerArgs],
    env: process.env as Record<string, string>,
  });
  mcpClient = new Client(
    {
      name: DAEMON_CLIENT_NAME,
      version: VERSION,
    },
    {
      capabilities: {},
    },
  );
  await mcpClient.connect(mcpTransport);

  console.log('MCP client connected');
}

interface McpContent {
  type: string;
  text?: string;
}

interface McpResult {
  content?: McpContent[] | string;
  text?: string;
}
async function handleRequest(msg: DaemonMessage) {
  try {
    if (msg.method === 'invoke_tool') {
      if (!mcpClient) {
        throw new Error('MCP client not initialized');
      }
      const {tool, args} = msg;

      const result = (await mcpClient.callTool({
        name: tool,
        arguments: args || {},
      })) as McpResult | McpContent[];

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
      return {
        success: true,
        result: JSON.stringify({
          pid: process.pid,
          socketPath,
          startDate: startDate.toISOString(),
          version: VERSION,
          args: mcpServerArgs,
        }),
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
      const transport = new PipeTransport(socket, socket);
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
          // Setup MCP client
          await setupMCPClient();
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
    await mcpClient?.close();
  } catch (error) {
    logger?.('Error closing MCP client:', error);
  }
  try {
    await mcpTransport?.close();
  } catch (error) {
    logger?.('Error closing MCP transport:', error);
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
process.on('unhandledRejection', error => {
  logger?.('Unhandled rejection:', error);
  void cleanup(1);
});

// Start the server
const started = startSocketServer().catch(error => {
  logger?.('Failed to start daemon server:', error);
  void cleanup(1);
});
