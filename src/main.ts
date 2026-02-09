/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import process from 'node:process';

import {parseArguments} from './cli.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpResponse} from './McpResponse.js';
import {SessionManager} from './SessionManager.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
  zod,
} from './third_party/index.js';
import {ToolCategory} from './tools/categories.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools, sessionToolNames} from './tools/tools.js';

const VERSION = '0.16.0';

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

void logFile;

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);
const server = new McpServer(
  {
    name: 'chrome_devtools',
    title: 'Chrome DevTools MCP server (multi-session)',
    version: VERSION,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

const devtools = args.experimentalDevtools ?? false;
const sessionManager = new SessionManager({
  experimentalDevToolsDebugging: devtools,
  experimentalIncludeAllPages: args.experimentalIncludeAllPages,
  performanceCrux: args.performanceCrux,
});

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function gracefulShutdown(signal: string): Promise<void> {
  if (sessionManager.isShuttingDown) {
    return;
  }
  logger(`Received ${signal}, shutting down...`);
  try {
    await Promise.race([
      sessionManager.closeAllSessions(),
      new Promise(resolve => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ]);
  } catch (err) {
    logger('Error during shutdown:', err);
  }
  process.exit(0);
}

process.once('SIGINT', () => void gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));

const sessionIdSchema = zod
  .string()
  .describe(
    'The session ID of the Chrome browser instance to use. Obtain one by calling create_session first.',
  );

function registerSessionTool(tool: ToolDefinition): void {
  if (tool.name === 'create_session') {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        try {
          logger(`create_session request: ${JSON.stringify(params, null, '  ')}`);

          let viewport: {width: number; height: number} | undefined;
          if (params.viewport && typeof params.viewport === 'string') {
            const [w, h] = params.viewport.split('x').map(Number);
            if (w && h) {
              viewport = {width: w, height: h};
            }
          }

          const session = await sessionManager.createSession({
            headless: params.headless as boolean | undefined,
            viewport,
            label: params.label as string | undefined,
            channel: args.channel as 'stable' | 'canary' | 'beta' | 'dev' | undefined,
            executablePath: args.executablePath,
            chromeArgs: (args.chromeArg ?? []).map(String),
            ignoreDefaultChromeArgs: (args.ignoreDefaultChromeArg ?? []).map(String),
            acceptInsecureCerts: args.acceptInsecureCerts,
            devtools,
            enableExtensions: args.categoryExtensions,
          });

          if (params.url && typeof params.url === 'string') {
            const page = session.context.getSelectedPage();
            await page.goto(params.url);
          }

          return {
            content: [
              {
                type: 'text',
                text: [
                  `# create_session response`,
                  `Session created successfully.`,
                  ``,
                  `**sessionId**: \`${session.sessionId}\``,
                  ``,
                  `Use this sessionId in ALL subsequent tool calls.`,
                  session.label ? `**label**: ${session.label}` : '',
                ].filter(Boolean).join('\n'),
              },
            ],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{type: 'text', text: msg}],
            isError: true,
          };
        }
      },
    );
    return;
  }

  if (tool.name === 'list_sessions') {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (): Promise<CallToolResult> => {
        const sessions = sessionManager.listSessions();
        const lines = [`# list_sessions response`, `Total sessions: ${sessions.length}`, ''];
        for (const s of sessions) {
          lines.push(
            `- **${s.sessionId}**${s.label ? ` (${s.label})` : ''} — created: ${s.createdAt}, connected: ${s.connected}`,
          );
        }
        if (sessions.length === 0) {
          lines.push('No active sessions. Use create_session to create one.');
        }
        return {
          content: [{type: 'text', text: lines.join('\n')}],
        };
      },
    );
    return;
  }

  if (tool.name === 'close_session') {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        try {
          const sessionId = params.sessionId as string;
          await sessionManager.closeSession(sessionId);
          return {
            content: [
              {
                type: 'text',
                text: `# close_session response\nSession "${sessionId}" closed successfully.`,
              },
            ],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{type: 'text', text: msg}],
            isError: true,
          };
        }
      },
    );
    return;
  }
}

function registerBrowserTool(tool: ToolDefinition): void {
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
  if (
    tool.annotations.category === ToolCategory.EXTENSIONS &&
    args.categoryExtensions === false
  ) {
    return;
  }
  if (
    tool.annotations.conditions?.includes('computerVision') &&
    !args.experimentalVision
  ) {
    return;
  }
  if (
    tool.annotations.conditions?.includes('experimentalInteropTools') &&
    !args.experimentalInteropTools
  ) {
    return;
  }

  if ('sessionId' in tool.schema) {
    throw new Error(
      `Tool "${tool.name}" defines its own sessionId schema, which conflicts with session management.`,
    );
  }

  const schemaWithSession = {
    ...tool.schema,
    sessionId: sessionIdSchema,
  };

  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: schemaWithSession,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
      const sessionId = params.sessionId as string;
      if (!sessionId) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: sessionId is required. Create a session first using create_session.',
            },
          ],
          isError: true,
        };
      }

      let session;
      try {
        session = sessionManager.getSession(sessionId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{type: 'text', text: msg}],
          isError: true,
        };
      }

      const guard = await session.mutex.acquire();
      try {
        logger(`${tool.name} [session=${sessionId}] request: ${JSON.stringify(params, null, '  ')}`);
        const context = session.context;
        await context.detectOpenDevToolsWindows();
        const response = new McpResponse();
        await tool.handler(
          {params},
          response,
          context,
        );
        const {content} = await response.handle(tool.name, context);
        return {content};
      } catch (err) {
        logger(`${tool.name} [session=${sessionId}] error:`, err);
        let errorText: string;
        if (err instanceof Error) {
          errorText = err.message;
          if (err.cause instanceof Error) {
            errorText += `\nCause: ${err.cause.message}`;
          }
        } else {
          errorText = String(err);
        }
        return {
          content: [{type: 'text', text: errorText}],
          isError: true,
        };
      } finally {
        guard.dispose();
      }
    },
  );
}

for (const tool of tools) {
  if (sessionToolNames.has(tool.name)) {
    registerSessionTool(tool);
  } else {
    registerBrowserTool(tool);
  }
}

await loadIssueDescriptions();
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected (multi-session mode)');

console.error(
  `chrome-devtools-mcp (multi-session) exposes content of browser instances to MCP clients.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.
All browser tools require a sessionId parameter. Use create_session to get one.`,
);
