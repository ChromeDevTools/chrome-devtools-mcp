/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chrome AI Bridge - Extension-only Mode (v2.0.0)
 *
 * This MCP server provides ChatGPT/Gemini integration via Chrome extension.
 * Puppeteer has been removed - all browser interaction is via WebSocket relay.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {
  isInitializeRequest,
  SetLevelRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {parseArguments} from './cli.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {ToolRegistry, PluginLoader} from './plugin-api.js';
import {
  registerOptionalTools,
  WEB_LLM_TOOLS_INFO,
} from './tools/optional-tools.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import type {Context} from './tools/ToolDefinition.js';
import {getFastContext} from './fast-cdp/fast-context.js';
import {cleanupAllConnections} from './fast-cdp/fast-chat.js';
import {generateAgentId, setAgentId} from './fast-cdp/agent-context.js';
import {cleanupStaleSessions} from './fast-cdp/session-manager.js';
import {getSessionConfig} from './config.js';

function readPackageJson(): {version?: string} {
  const currentDir = import.meta.dirname;
  const packageJsonPath = path.join(currentDir, '..', '..', 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }
  try {
    const json = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    assert.strict(json['name'], 'chrome-ai-bridge');
    return json;
  } catch {
    return {};
  }
}

const version = readPackageJson().version ?? 'unknown';

export const args = parseArguments(version);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

logger(`Starting Chrome AI Bridge v${version} (Extension-only mode)`);

// Initialize agent ID for Agent Teams support
const agentId = generateAgentId();
setAgentId(agentId);

// Start session cleanup timer
const sessionConfig = getSessionConfig();
const cleanupTimer = setInterval(async () => {
  try {
    const removed = await cleanupStaleSessions();
    if (removed > 0) {
      logger(`[session] Cleaned up ${removed} stale sessions`);
    }
  } catch (error) {
    logger(`[session] Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
  }
}, sessionConfig.cleanupIntervalMinutes * 60 * 1000);
cleanupTimer.unref();  // Don't keep process alive for cleanup

const server = new McpServer(
  {
    name: 'chrome-ai-bridge',
    title: 'Chrome AI Bridge - ChatGPT/Gemini via Extension',
    version,
  },
  {capabilities: {logging: {}}},
);

server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

const logDisclaimers = () => {
  console.error(
    `chrome-ai-bridge connects to ChatGPT/Gemini via Chrome extension.
Make sure the chrome-ai-bridge extension is installed and Chrome is running.
Available tools: ask_chatgpt_web, ask_gemini_web, ask_chatgpt_gemini_web, take_cdp_snapshot, get_page_dom, ask_gemini_image`,
  );
};

const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
      const guard = await toolMutex.acquire();
      try {
        logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
        // All tools use FastContext (extension-based, no Puppeteer)
        const context = getFastContext() as unknown as Context;
        const response = new McpResponse();
        await tool.handler(
          {
            params,
          },
          response,
          context,
        );
        try {
          const content = await response.handle(tool.name, context);
          return {
            content,
          };
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);

          // Detect extension connection error
          if (
            errorText.includes('Extension connection') ||
            errorText.includes('timeout') ||
            errorText.includes('disconnected')
          ) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Extension connection lost or not available.\n\nMake sure:\n1. Chrome is running\n2. The chrome-ai-bridge extension is installed\n3. The extension is enabled\n\nError: ${errorText}`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
            isError: true,
          };
        }
      } finally {
        guard.dispose();
      }
    },
  );
}

// Use ToolRegistry for plugin architecture
const toolRegistry = new ToolRegistry();

// Register optional tools (ChatGPT/Gemini via extension)
// Note: Core tools (Puppeteer-based) are no longer available in v2.0
const optionalCount = registerOptionalTools(toolRegistry);
if (optionalCount > 0) {
  logger(`[tools] ${WEB_LLM_TOOLS_INFO.disclaimer}`);
}

// Load external plugins from MCP_PLUGINS environment variable
const pluginList = process.env.MCP_PLUGINS;
if (pluginList) {
  const pluginLoader = new PluginLoader(toolRegistry, logger);
  const {loaded, failed} = await pluginLoader.loadFromList(pluginList);
  if (loaded.length > 0) {
    logger(`[plugins] Successfully loaded: ${loaded.join(', ')}`);
  }
  if (failed.length > 0) {
    logger(`[plugins] Failed to load: ${failed.join(', ')}`);
  }
}

// Register all tools with MCP server
for (const tool of toolRegistry.getAll()) {
  registerTool(tool as unknown as ToolDefinition);
}
logger(`[tools] Total registered: ${toolRegistry.size} tools`);

const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome AI Bridge MCP Server connected');
logDisclaimers();

// Graceful shutdown handler with timeout
// Based on review: タイムアウト必須、強制終了タイマー必要
let isShuttingDown = false;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    // unref() prevents this timer from keeping the process alive
    timer.unref();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function shutdown(reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger(`Shutting down: ${reason}`);

  // Force exit timer (5 seconds) - prevents zombie if cleanup hangs
  const forceExitTimer = setTimeout(() => {
    logger('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 5000);
  forceExitTimer.unref();

  // Cleanup relay connections with 3 second timeout
  try {
    await withTimeout(cleanupAllConnections(), 3000, 'cleanupAllConnections');
  } catch (error) {
    logger(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Close log file
  if (logFile) {
    logFile.close();
  }

  clearTimeout(forceExitTimer);
  process.exit(0);
}

// stdin close = Claude Code disconnected (most reliable on Windows too)
process.stdin.on('end', () => shutdown('stdin ended'));
process.stdin.on('close', () => shutdown('stdin closed'));

// Signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep beforeExit for edge cases where stdin doesn't close
process.on('beforeExit', () => {
  if (logFile) {
    logFile.close();
  }
});

const httpPortRaw = process.env.MCP_HTTP_PORT;
if (httpPortRaw) {
  const httpPort = Number(httpPortRaw);
  if (!Number.isFinite(httpPort) || httpPort <= 0) {
    console.error(`[http] Invalid MCP_HTTP_PORT: ${httpPortRaw}`);
  } else {
    const httpHost = process.env.MCP_HTTP_HOST || '127.0.0.1';
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    const serverHttp = http.createServer(async (req, res) => {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      // Basic CORS for local usage (Codex / local tools)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'content-type,mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      const url = new URL(req.url, `http://${httpHost}:${httpPort}`);
      if (url.pathname !== '/mcp') {
        res.writeHead(404).end();
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', async () => {
          let json: any;
          try {
            json = body ? JSON.parse(body) : null;
          } catch {
            res.writeHead(400).end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {code: -32700, message: 'Parse error'},
                id: null,
              }),
            );
            return;
          }

          let transport: StreamableHTTPServerTransport | undefined;
          if (sessionId && transports[sessionId]) {
            transport = transports[sessionId];
          } else if (!sessionId && isInitializeRequest(json)) {
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: newSessionId => {
                transports[newSessionId] = transport!;
              },
            });
            transport.onclose = () => {
              if (transport?.sessionId) {
                delete transports[transport.sessionId];
              }
            };
            await server.connect(transport);
          } else {
            res.writeHead(400).end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Bad Request: No valid session ID provided',
                },
                id: null,
              }),
            );
            return;
          }

          try {
            await transport.handleRequest(req, res, json);
          } catch (error) {
            if (!res.headersSent) {
              res.writeHead(500).end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32603,
                    message:
                      error instanceof Error
                        ? error.message
                        : String(error),
                  },
                  id: null,
                }),
              );
            }
          }
        });
        return;
      }

      if (req.method === 'GET' || req.method === 'DELETE') {
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400).end('Invalid or missing session ID');
          return;
        }
        try {
          await transports[sessionId].handleRequest(req, res);
        } catch (error) {
          if (!res.headersSent) {
            res.writeHead(500).end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32603,
                  message:
                    error instanceof Error ? error.message : String(error),
                },
                id: null,
              }),
            );
          }
        }
        return;
      }

      res.writeHead(405).end();
    });

    serverHttp.listen(httpPort, httpHost, () => {
      console.error(`[http] MCP Streamable HTTP listening on http://${httpHost}:${httpPort}/mcp`);
    });
  }
}
