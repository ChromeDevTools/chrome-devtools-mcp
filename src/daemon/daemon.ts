#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import {createServer, type Server} from 'node:net';
import process from 'node:process';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

import {logger} from '../logger.js';
import {PipeTransport} from '../third_party/index.js';

import {
  getSocketPath,
  handlePidFile,
  INDEX_SCRIPT_PATH,
  IS_WINDOWS,
} from './utils.js';

const pidFile = handlePidFile();
const socketPath = getSocketPath();

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let server: Server | null = null;

async function setupMCPClient() {
  console.log('Setting up MCP client connection...');

  const args = process.argv.slice(2);
  // Create stdio transport for chrome-devtools-mcp
  mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [INDEX_SCRIPT_PATH, ...args],
    env: process.env as Record<string, string>,
  });
  mcpClient = new Client(
    {
      name: 'chrome-devtools-cli-daemon',
      // TODO: handle client version (optional).
      version: '0.1.0',
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

type DaemonMessage =
  | {
      method: 'stop';
    }
  | {
      method: 'invoke_tool';
      tool: string;
      args?: Record<string, unknown>;
    };

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
      // Trigger cleanup asynchronously
      setImmediate(() => {
        void cleanup();
      });
      return {
        success: true,
        message: 'stopping',
      };
    } else {
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
      await fs.unlink(socketPath);
    } catch {
      // ignore errors.
    }
  }

  return await new Promise<void>((resolve, reject) => {
    server = createServer(socket => {
      const transport = new PipeTransport(socket, socket);
      transport.onmessage = async (message: string) => {
        logger('onmessage', message);
        const response = await handleRequest(JSON.parse(message));
        transport.send(JSON.stringify(response));
        socket.end();
      };
      socket.on('error', error => {
        logger('Socket error:', error);
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
      logger('Server error:', error);
      reject(error);
    });
  });
}

async function cleanup() {
  console.log('Cleaning up daemon...');

  try {
    await mcpClient?.close();
  } catch (error) {
    logger('Error closing MCP client:', error);
  }
  try {
    await mcpTransport?.close();
  } catch (error) {
    logger('Error closing MCP transport:', error);
  }
  server?.close(() => {
    if (!IS_WINDOWS) {
      void fs.unlink(socketPath).catch(() => undefined);
    }
  });
  await fs.unlink(pidFile).catch(() => undefined);
  process.exit(0);
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
  logger('Uncaught exception:', error);
});
process.on('unhandledRejection', error => {
  logger('Unhandled rejection:', error);
});

// Start the server
startSocketServer().catch(error => {
  logger('Failed to start daemon server:', error);
  process.exit(1);
});
