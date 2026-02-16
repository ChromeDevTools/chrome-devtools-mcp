#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import {createServer, type Server} from 'node:net';
import os from 'node:os';
import process from 'node:process';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

import {getDaemonPaths, INDEX_SCRIPT_PATH} from './daemonUtils.js';

const {pidFile: PID_FILE, socketPath: SOCKET_PATH} = await getDaemonPaths();

const IS_WINDOWS = os.platform() === 'win32';

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

async function handleRequest(message: unknown) {
  try {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('method' in message)
    ) {
      throw new Error('Invalid message format');
    }

    const msg = message as {
      method: string;
      tool?: string;
      args?: Record<string, unknown>;
    };

    if (msg.method === 'invoke_tool') {
      if (!mcpClient) {
        throw new Error('MCP client not initialized');
      }
      const {tool, args} = msg;
      if (!tool) {
        throw new Error('Tool name required');
      }

      const result = (await mcpClient.callTool({
        name: tool,
        arguments: args || {},
      })) as McpResult | McpContent[];

      // Extract text content from MCP response
      let textContent = '';

      // Check if result is an array of content blocks
      if (Array.isArray(result)) {
        textContent = result
          .filter(block => block && block.type === 'text' && block.text)
          .map(block => block.text)
          .join('\n');
      }
      // Check if result has a content property
      else if (result && result.content) {
        if (Array.isArray(result.content)) {
          // Extract text from all text-type content blocks
          textContent = result.content
            .filter(block => block && block.type === 'text' && block.text)
            .map(block => block.text)
            .join('\n');
        } else if (typeof result.content === 'string') {
          textContent = result.content;
        }
      }
      // Check if result has a text property
      else if (result && result.text) {
        textContent = result.text;
      }
      // Check if result is a string
      else if (typeof result === 'string') {
        textContent = result;
      }

      // Fallback: stringify if we couldn't extract text
      if (!textContent) {
        textContent = JSON.stringify(result, null, 2);
      }
      return {
        success: true,
        result: textContent,
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
        error: `Unknown method: ${msg.method}`,
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

function startSocketServer() {
  const startServer = () => {
    return new Promise<void>((resolve, reject) => {
      server = createServer(socket => {
        let buffer = '';
        socket.on('data', async data => {
          buffer += data.toString();

          // Try to parse complete JSON messages
          try {
            // Check if buffer ends with null terminator
            if (buffer.endsWith('\0')) {
              const message = JSON.parse(buffer.slice(0, -1));
              buffer = ''; // Clear buffer after successful parse

              const response = await handleRequest(message);
              socket.write(JSON.stringify(response) + '\0');
              socket.end();
            }
          } catch {
            // Not complete JSON yet, wait for more data
            if (buffer.includes('\0')) {
              // Try parsing split by null terminator
              const parts = buffer.split('\0');
              buffer = parts.pop() || ''; // Keep incomplete part in buffer

              for (const part of parts) {
                if (part.trim()) {
                  try {
                    const message = JSON.parse(part);
                    const response = await handleRequest(message);
                    socket.write(JSON.stringify(response) + '\0');
                  } catch {
                    socket.write(
                      JSON.stringify({success: false, error: 'Invalid JSON'}) +
                        '\0',
                    );
                  }
                }
              }
              socket.end();
            }
          }
        });
        socket.on('error', error => {
          console.error('Socket error:', error);
        });
      });

      server.listen(SOCKET_PATH, async () => {
        console.log(`Daemon server listening on ${SOCKET_PATH}`);

        // Write PID file
        await fs.writeFile(PID_FILE, String(process.pid), 'utf-8');

        try {
          // Setup MCP client
          await setupMCPClient();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      server.on('error', error => {
        console.error('Server error:', error);
        reject(error);
      });
    });
  };

  // Remove existing socket file if it exists (only on non-Windows)
  if (!IS_WINDOWS) {
    return fs
      .unlink(SOCKET_PATH)
      .catch(() => {
        // Ignore if file doesn't exist
      })
      .then(() => startServer());
  } else {
    return startServer();
  }
}

async function cleanup() {
  console.log('Cleaning up daemon...');

  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch (error) {
      console.error('Error closing MCP client:', error);
    }
  }
  if (mcpTransport) {
    try {
      await mcpTransport.close();
    } catch (error) {
      console.error('Error closing MCP transport:', error);
    }
  }
  if (server) {
    server.close(() => {
      if (!IS_WINDOWS) {
        void fs.unlink(SOCKET_PATH).catch(() => undefined);
      }
    });
  }
  await fs.unlink(PID_FILE).catch(() => undefined);
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
  console.error('Uncaught exception:', error);
  void cleanup();
});
process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
  void cleanup();
});

// Start the server
startSocketServer().catch(error => {
  console.error('Failed to start daemon server:', error);
  process.exit(1);
});
