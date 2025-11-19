/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import type {Channel} from './browser.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {args, VERSION} from './config.js';
import {
  getContext as getContextInstance,
  setContextInstance,
} from './context.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import {ToolCategory} from './tools/categories.js';
import * as consoleTools from './tools/console.js';
import * as emulationTools from './tools/emulation.js';
import * as inputTools from './tools/input.js';
import * as networkTools from './tools/network.js';
import * as pagesTools from './tools/pages.js';
import * as performanceTools from './tools/performance.js';
import * as screenshotTools from './tools/screenshot.js';
import * as scriptTools from './tools/script.js';
import * as snapshotTools from './tools/snapshot.js';
import * as switchBrowserTool from './tools/switch_browser.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);
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

async function getContext(): Promise<McpContext> {
  let context = getContextInstance();

  if (args.noLaunch && !context) {
    throw new Error(
      'No browser connected. Use the switch_browser tool to connect to a browser instance.',
    );
  }

  const extraArgs: string[] = (args.chromeArg ?? []).map(String);
  if (args.proxyServer) {
    extraArgs.push(`--proxy-server=${args.proxyServer}`);
  }
  const devtools = args.experimentalDevtools ?? false;

  if (!args.noLaunch) {
    const browser =
      args.browserUrl || args.wsEndpoint
        ? await ensureBrowserConnected({
            browserURL: args.browserUrl,
            wsEndpoint: args.wsEndpoint,
            wsHeaders: args.wsHeaders,
            devtools,
          })
        : await ensureBrowserLaunched({
            headless: args.headless,
            executablePath: args.executablePath,
            channel: args.channel as Channel,
            isolated: args.isolated,
            logFile,
            viewport: args.viewport,
            args: extraArgs,
            acceptInsecureCerts: args.acceptInsecureCerts,
            devtools,
          });

    if (context?.browser !== browser) {
      context = await McpContext.from(browser, logger, {
        experimentalDevToolsDebugging: devtools,
        experimentalIncludeAllPages: args.experimentalIncludeAllPages,
      });
      setContextInstance(context);
    }
  }

  if (!context) {
    throw new Error(
      'Failed to initialize browser context. This should not happen.',
    );
  }

  return context;
}

const logDisclaimers = () => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );
};

const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
  if (
    tool.annotations.category === ToolCategory.EMULATION &&
    args.categoryEmulation === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.PERFORMANCE &&
    args.categoryPerformance === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.NETWORK &&
    args.categoryNetwork === false
  ) {
    return;
  }
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
        const context = await getContext();
        logger(`${tool.name} context: resolved`);
        await context.detectOpenDevToolsWindows();
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
      } catch (err) {
        logger(`${tool.name} error: ${err.message}`);
        throw err;
      } finally {
        guard.dispose();
      }
    },
  );
}

const tools = [
  ...Object.values(consoleTools),
  ...Object.values(emulationTools),
  ...Object.values(inputTools),
  ...Object.values(networkTools),
  ...Object.values(pagesTools),
  ...Object.values(performanceTools),
  ...Object.values(screenshotTools),
  ...Object.values(scriptTools),
  ...Object.values(snapshotTools),
  ...Object.values(switchBrowserTool),
] as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

for (const tool of tools) {
  registerTool(tool);
}

await loadIssueDescriptions();
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
logDisclaimers();
