/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Mock browser globals for chrome-devtools-frontend (Node.js environment)
// NOTE: chrome-devtools-frontend expects browser globals (location, self, localStorage)
// These are only needed for trace-processing modules, not for core MCP functionality
if (typeof globalThis.location === 'undefined') {
  (globalThis as any).location = {
    search: '',
    href: '',
    protocol: 'file:',
    host: '',
    hostname: '',
    port: '',
    pathname: '',
    hash: '',
  };
}

if (typeof globalThis.self === 'undefined') {
  (globalThis as any).self = globalThis;
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
}

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
  RootsListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {Browser} from 'puppeteer-core';

import type {Channel} from './browser.js';
import {resolveBrowser} from './browser.js';
import {parseArguments} from './cli.js';
import {setupGraceful} from './graceful.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {ToolRegistry, PluginLoader} from './plugin-api.js';
import {setProjectRoot} from './project-root-state.js';
import {resolveRoots, type RootsInfo} from './roots-manager.js';
import {runStartupCheck} from './startup-check.js';
import {registerCoreTools, getCoreToolCount} from './tools/core-tools.js';
import {
  registerOptionalTools,
  getOptionalToolCount,
  WEB_LLM_TOOLS_INFO,
} from './tools/optional-tools.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';

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

logger(`Starting Chrome DevTools MCP for Extension Development v${version}`);
logger(
  `[startup] argv attachTab=${String(args.attachTab)} attachTabUrl=${String(
    args.attachTabUrl,
  )} attachTabNew=${String(args.attachTabNew)} extensionRelayPort=${String(
    args.extensionRelayPort,
  )}`,
);
if (args.attachTab || args.attachTabUrl || process.env.MCP_DEBUG_EXTENSION) {
  console.error(
    `[startup-debug] attachTab=${String(
      args.attachTab,
    )} attachTabUrl=${String(args.attachTabUrl)} attachTabNew=${String(
      args.attachTabNew,
    )} extensionRelayPort=${String(args.extensionRelayPort)}`,
  );
}
const server = new McpServer(
  {
    name: 'chrome-ai-bridge',
    title: 'Chrome DevTools MCP for Extension Development',
    version,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

// Handle roots/list_changed notification
server.server.setNotificationHandler(
  RootsListChangedNotificationSchema,
  async () => {
    logger(
      '[roots] Received roots/list_changed notification - roots have changed',
    );
    // Invalidate cached roots info
    cachedRootsInfo = null;
    logger(
      '[roots] Cached roots cleared - will re-fetch on next browser launch',
    );
  },
);

let context: McpContext;
const uiHealthCheckRun = false; // Track if UI health check has been run
let cachedRootsInfo: RootsInfo | null = null; // Cache roots info
let initializationComplete = false; // Track if MCP initialization is complete

// Setup graceful shutdown
const graceful = setupGraceful({
  getBrowser: () => context?.browser,
  onBeforeExit: async () => {
    logger('[graceful] Running pre-exit cleanup...');
    // Close log file if exists
    if (logFile) {
      logFile.close();
    }
  },
});

async function getContext(): Promise<McpContext> {
  // Wait for initialization to complete before resolving roots
  if (!initializationComplete) {
    logger('[roots] Waiting for MCP initialization to complete...');
    await new Promise(resolve => setTimeout(resolve, 100)); // Brief wait
    if (!initializationComplete) {
      logger(
        '[roots] WARNING: MCP not yet initialized, proceeding without roots',
      );
    }
  }

  // Resolve roots info (cached or fresh)
  if (!cachedRootsInfo) {
    cachedRootsInfo = await resolveRoots(server.server, {
      cliProjectRoot: args.projectRoot as string | undefined,
      envProjectRoot: process.env.MCP_PROJECT_ROOT,
      autoCwd: process.cwd(),
    });
  }

  // Initialize project root for profile isolation
  // Priority: CLI flag > MCP_PROJECT_ROOT env > Roots protocol > cwd
  const rootFromRoots = cachedRootsInfo?.rootsUris?.[0]
    ? cachedRootsInfo.rootsUris[0].replace('file://', '')
    : undefined;

  const projectRootToSet =
    (args.projectRoot as string | undefined) ||
    process.env.MCP_PROJECT_ROOT ||
    rootFromRoots ||
    process.cwd();

  setProjectRoot(projectRootToSet);
  logger(`[project-root] Initialized: ${projectRootToSet}`);

  const browserOptions = {
    browserUrl: args.browserUrl,
    headless: args.headless,
    executablePath: args.executablePath,
    customDevTools: args.customDevtools,
    channel: args.channel as Channel,
    isolated: args.isolated,
    loadExtension: args.loadExtension as string | undefined,
    loadExtensionsDir: args.loadExtensionsDir as string | undefined,
    loadSystemExtensions: args.loadSystemExtensions as boolean | undefined,
    chromeProfile: args.chromeProfile as string | undefined,
    userDataDir: args.userDataDir as string | undefined,
    logFile,
    rootsInfo: cachedRootsInfo, // Pass roots info to browser
    focus: args.focus as boolean | undefined, // v1.0.18: Background mode control
    attachTab: args.attachTab as number | undefined, // Extension Bridge mode (by tab ID)
    attachTabUrl: args.attachTabUrl as string | undefined, // Extension Bridge mode (by URL)
    attachTabNew: args.attachTabNew as boolean | undefined, // Extension Bridge mode (force new tab)
    extensionRelayPort: args.extensionRelayPort as number | undefined, // Extension Bridge relay port
  };

  const browser = await resolveBrowser(browserOptions);

  // Announce browser PID for graceful shutdown
  const browserPid = browser.process()?.pid;
  if (browserPid) {
    await graceful.announceBrowserPid(browserPid);
  }

  // Browser factory function for reconnection
  const browserFactory = async () => {
    logger('Reconnecting browser...');
    return await resolveBrowser(browserOptions);
  };

  // Always recreate context if browser reference changed or context doesn't exist
  if (!context || context.browser !== browser) {
    // Connection manager options with reconnect callback
    const connectionOptions = {
      onReconnect: async (newBrowser: Browser) => {
        logger('Updating context with reconnected browser...');
        await context.updateBrowser(newBrowser);
      },
    };

    context = await McpContext.from(
      browser,
      logger,
      browserFactory,
      connectionOptions,
    );

    // UI health check disabled - causes duplicate ChatGPT tabs
    // TODO: Re-enable after fixing tab management
    // if (!uiHealthCheckRun) {
    //   uiHealthCheckRun = true;
    //   runStartupCheck(browser).catch(err => {
    //     logger(`Startup check failed: ${err}`);
    //   });
    // }
  }

  return context;
}

const logDisclaimers = () => {
  console.error(
    `chrome-ai-bridge exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );
};

const toolMutex = new Mutex();
const FAST_TOOLS = new Set(['ask_chatgpt_web', 'ask_gemini_web', 'ask_chatgpt_gemini_web']);

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
        const context = FAST_TOOLS.has(tool.name)
          ? ((await import('./fast-cdp/fast-context.js')).getFastContext() as unknown as McpContext)
          : await getContext();
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

          // Detect browser closed error and provide helpful message
          if (
            errorText.includes('Target closed') ||
            errorText.includes('Session closed')
          ) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Browser connection lost. The Chrome instance was closed or disconnected.\n\nPlease restart the MCP server to reconnect.`,
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

// v0.26.0: Use ToolRegistry for plugin architecture
const toolRegistry = new ToolRegistry();

// Register core tools (stable, site-independent)
registerCoreTools(toolRegistry);
logger(`[tools] Registered ${getCoreToolCount()} core tools`);

// Register optional tools (web-llm, site-dependent)
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

// Set initialization callback
server.server.oninitialized = () => {
  initializationComplete = true;
  logger('[roots] MCP initialization complete');
};

const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
logDisclaimers();

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
