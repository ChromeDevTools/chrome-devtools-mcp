/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Modifications Copyright 2026 Colin (@cejor6)
 * - Extracted shared state (browser/context lifecycle + MutexRegistry) from
 *   createMcpServer so multiple McpServer instances (e.g. stdio + concurrent
 *   HTTP sessions) can share a single Chrome instance.
 * - Swapped the single Mutex for MutexRegistry to enable per-page locking.
 */

import type fs from 'node:fs';

import type {parseArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import type {Channel} from './browser.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {MutexRegistry} from './Mutex.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import {FilePersistence} from './telemetry/persistence.js';
import {
  McpServer,
  type CallToolResult,
  SetLevelRequestSchema,
  ListRootsResultSchema,
  RootsListChangedNotificationSchema,
} from './third_party/index.js';
import {ToolHandler} from './ToolHandler.js';
import type {DefinedPageTool, ToolDefinition} from './tools/ToolDefinition.js';
import {createTools} from './tools/tools.js';
import {VERSION} from './version.js';

export {buildFlag} from './ToolHandler.js';

export interface SharedState {
  getContext(): Promise<McpContext>;
  mutexRegistry: MutexRegistry;
}

/**
 * Creates shared state used by one or more McpServer instances. The browser
 * is lazily launched/connected on first tool invocation; subsequent servers
 * sharing this state will see the same browser.
 *
 * Re-entrant: safe to call getContext() concurrently from multiple servers.
 * The current implementation serialises browser creation via the same single
 * promise chain (Node's await semantics on the shared `pending` promise).
 */
export function createSharedState(
  serverArgs: ReturnType<typeof parseArguments>,
  options: {
    logFile?: fs.WriteStream;
  },
  onContextReady?: (context: McpContext) => Promise<void>,
): SharedState {
  let context: McpContext;

  async function getContext(): Promise<McpContext> {
    const chromeArgs: string[] = (serverArgs.chromeArg ?? []).map(String);
    const ignoreDefaultChromeArgs: string[] = (
      serverArgs.ignoreDefaultChromeArg ?? []
    ).map(String);
    if (serverArgs.proxyServer) {
      chromeArgs.push(`--proxy-server=${serverArgs.proxyServer}`);
    }
    const devtools = serverArgs.experimentalDevtools ?? false;
    const browser =
      serverArgs.browserUrl || serverArgs.wsEndpoint || serverArgs.autoConnect
        ? await ensureBrowserConnected({
            browserURL: serverArgs.browserUrl,
            wsEndpoint: serverArgs.wsEndpoint,
            wsHeaders: serverArgs.wsHeaders,
            channel: serverArgs.autoConnect
              ? (serverArgs.channel as Channel)
              : undefined,
            userDataDir: serverArgs.userDataDir,
            devtools,
          })
        : await ensureBrowserLaunched({
            headless: serverArgs.headless,
            executablePath: serverArgs.executablePath,
            channel: serverArgs.channel as Channel,
            isolated: serverArgs.isolated ?? false,
            userDataDir: serverArgs.userDataDir,
            logFile: options.logFile,
            viewport: serverArgs.viewport,
            chromeArgs,
            ignoreDefaultChromeArgs,
            acceptInsecureCerts: serverArgs.acceptInsecureCerts,
            devtools,
            enableExtensions: serverArgs.categoryExtensions,
            viaCli: serverArgs.viaCli,
          });

    if (context?.browser !== browser) {
      context = await McpContext.from(browser, logger, {
        experimentalDevToolsDebugging: devtools,
        experimentalIncludeAllPages: serverArgs.experimentalIncludeAllPages,
        performanceCrux: serverArgs.performanceCrux,
      });
      if (onContextReady) {
        await onContextReady(context);
      }
    }
    return context;
  }

  return {
    getContext,
    mutexRegistry: new MutexRegistry(),
  };
}

export async function createMcpServer(
  serverArgs: ReturnType<typeof parseArguments>,
  options: {
    logFile?: fs.WriteStream;
  },
  sharedState?: SharedState,
) {
  if (serverArgs.usageStatistics) {
    ClearcutLogger.initialize({
      persistence: new FilePersistence(),
      logFile: serverArgs.logFile,
      appVersion: VERSION,
      clearcutEndpoint: serverArgs.clearcutEndpoint,
      clearcutForceFlushIntervalMs: serverArgs.clearcutForceFlushIntervalMs,
      clearcutIncludePidHeader: serverArgs.clearcutIncludePidHeader,
    });
  }

  const server = new McpServer(
    {
      name: 'chrome_devtools',
      title: 'Chrome DevTools MCP server',
      version: VERSION,
    },
    {capabilities: {logging: {}}},
  );
  server.server.setRequestHandler(SetLevelRequestSchema, () => {
    return {};
  });

  const updateRoots = async () => {
    if (!server.server.getClientCapabilities()?.roots) {
      return;
    }
    try {
      const roots = await server.server.request(
        {method: 'roots/list'},
        ListRootsResultSchema,
      );
      const ctx = await getContextForRoots();
      ctx?.setRoots(roots.roots);
    } catch (e) {
      logger('Failed to list roots', e);
    }
  };

  // Used by updateRoots — only resolves a context if one has already been
  // created. Avoids force-launching the browser just to set roots.
  async function getContextForRoots(): Promise<McpContext | undefined> {
    try {
      return await state.getContext();
    } catch {
      return undefined;
    }
  }

  server.server.oninitialized = () => {
    const clientName = server.server.getClientVersion()?.name;
    if (clientName) {
      ClearcutLogger.get()?.setClientName(clientName);
    }
    if (server.server.getClientCapabilities()?.roots) {
      void updateRoots();
      server.server.setNotificationHandler(
        RootsListChangedNotificationSchema,
        () => {
          void updateRoots();
        },
      );
    }
  };

  const state =
    sharedState ?? createSharedState(serverArgs, options, updateRoots);

  function registerTool(tool: ToolDefinition | DefinedPageTool): void {
    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      state.getContext,
      state.mutexRegistry,
    );

    if (!toolHandler.shouldRegister) {
      return;
    }

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolHandler.registeredInputSchema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        return await toolHandler.handle(params);
      },
    );
  }

  const tools = createTools(serverArgs);
  for (const tool of tools) {
    registerTool(tool);
  }

  await loadIssueDescriptions();

  return {server, sharedState: state};
}

export const logDisclaimers = (args: ReturnType<typeof parseArguments>) => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );

  if (!args.slim && args.performanceCrux) {
    console.error(
      `Performance tools may send trace URLs to the Google CrUX API to fetch real-user experience data. To disable, run with --no-performance-crux.`,
    );
  }

  if (!args.slim && args.usageStatistics) {
    console.error(
      `
Google collects usage statistics to improve Chrome DevTools MCP. To opt-out, run with --no-usage-statistics.
For more details, visit: https://github.com/ChromeDevTools/chrome-devtools-mcp#usage-statistics`,
    );
  }
};
