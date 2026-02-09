/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import process from 'node:process';

import {ensureVSCodeConnected, getPuppeteerBrowser} from './browser.js';
import {parseArguments} from './cli.js';
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
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools} from './tools/tools.js';

// If moved update release-please config
// x-release-please-start-version
const VERSION = '0.16.0';
// x-release-please-end

export const args = parseArguments(VERSION);

if (args.logFile) {
  saveLogsToFile(args.logFile);
}

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting VS Code DevTools MCP Server v${VERSION}`);
const server = new McpServer(
  {
    name: 'vscode_devtools',
    title: 'VS Code DevTools MCP server',
    version: VERSION,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

let context: McpContext | undefined;

/**
 * Ensure VS Code debug window is connected (CDP + bridge).
 * Required for ALL tools including diagnostic ones.
 */
async function ensureConnection(): Promise<void> {
  await ensureVSCodeConnected({
    workspaceFolder: args.folder as string,
    extensionBridgePath: args.extensionBridgePath as string,
    targetFolder: args.targetFolder as string | undefined,
    headless: args.headless,
  });
}

/**
 * Get or create the McpContext (Puppeteer page model).
 * Only needed for non-diagnostic tools that interact via Puppeteer.
 */
async function getContext(): Promise<McpContext> {
  if (!context) {
    const browser = getPuppeteerBrowser();
    if (!browser) {
      throw new Error(
        'Puppeteer Browser not available. The ElectronTransport may have failed during connection.',
      );
    }
    context = await McpContext.from(browser, logger, {
      experimentalDevToolsDebugging: false,
      performanceCrux: false,
    });
  }
  return context;
}

const logDisclaimers = () => {
  console.error(
    `vscode-devtools-mcp exposes content of the VS Code debug window to MCP clients,
allowing them to inspect, debug, and modify any data visible in the editor.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );
};

const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
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
    tool.annotations.conditions?.includes('computerVision') &&
    !args.experimentalVision
  ) {
    return;
  }
  // Hide diagnostic tools in production unless explicitly enabled
  if (
    tool.annotations.conditions?.includes('devDiagnostic') &&
    !args.devDiagnostic
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

        // Always ensure VS Code connection (CDP + bridge)
        await ensureConnection();

        // Diagnostic tools bypass McpContext — they use sendCdp/bridgeExec directly.
        // Non-diagnostic tools need full McpContext (Phase B will refactor this).
        const isDiagnostic = tool.annotations.conditions?.includes('devDiagnostic');
        const ctx = isDiagnostic ? (undefined as never) : await getContext();

        logger(`${tool.name} context: resolved`);
        const response = new McpResponse();
        await tool.handler(
          {
            params,
          },
          response,
          ctx,
        );

        // Diagnostic tools return content directly without McpResponse.handle()
        if (isDiagnostic) {
          const textContent: Array<{type: 'text'; text: string}> = [];
          for (const line of response.responseLines) {
            textContent.push({type: 'text', text: line});
          }
          if (textContent.length === 0) {
            textContent.push({type: 'text', text: '(no output)'});
          }
          return {content: textContent};
        }

        const {content, structuredContent} = await response.handle(
          tool.name,
          ctx,
        );
        const result: CallToolResult & {
          structuredContent?: Record<string, unknown>;
        } = {
          content,
        };
        if (args.experimentalStructuredContent) {
          result.structuredContent = structuredContent as Record<
            string,
            unknown
          >;
        }
        return result;
      } catch (err) {
        logger(`${tool.name} error:`, err, err?.stack);
        let errorText = err && 'message' in err ? err.message : String(err);
        if ('cause' in err && err.cause) {
          errorText += `\nCause: ${err.cause.message}`;
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
      } finally {
        guard.dispose();
      }
    },
  );
}

for (const tool of tools) {
  registerTool(tool);
}

await loadIssueDescriptions();
const transport = new StdioServerTransport();
await server.connect(transport);
logger('VS Code DevTools MCP Server connected');
logDisclaimers();
