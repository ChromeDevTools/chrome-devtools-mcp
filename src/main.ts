/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import process from 'node:process';

import {ensureVSCodeConnected, getConnectionGeneration, getPuppeteerBrowser, stopDebugWindow, runHostShellTaskOrThrow} from './vscode.js';
import {hasExtensionChanged, saveExtensionSnapshot} from './extension-watcher.js';
import {checkForBlockingUI} from './notification-gate.js';
import {parseArguments} from './cli.js';
import {loadConfig, type ResolvedConfig} from './config.js';
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

// Default timeout for tools (30 seconds)
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

class ToolTimeoutError extends Error {
  constructor(toolName: string, timeoutMs: number) {
    super(
      `Tool "${toolName}" timed out after ${timeoutMs}ms. The operation took too long to complete.`,
    );
    this.name = 'ToolTimeoutError';
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ToolTimeoutError(toolName, timeoutMs));
      }, timeoutMs);
    }),
  ]);
}

// If moved update release-please config
// x-release-please-start-version
const VERSION = '0.16.0';
// x-release-please-end

// Parse CLI args and load config from workspace's .vscode/devtools.json
const cliArgs = parseArguments(VERSION);
export const config: ResolvedConfig = loadConfig(cliArgs);

// Legacy export for backwards compatibility
export const args = cliArgs;

if (config.logFile) {
  saveLogsToFile(config.logFile);
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
let contextGeneration = -1;

/**
 * Ensure VS Code debug window is connected (CDP + bridge).
 * Required for ALL tools including diagnostic ones.
 */

async function ensureConnection(): Promise<void> {
  await ensureVSCodeConnected({
    workspaceFolder: config.hostWorkspace,
    extensionBridgePath: config.extensionBridgePath,
    targetFolder: config.workspaceFolder,
    headless: config.headless,
    launch: config.launch,
  });
}

/**
 * Get or create the McpContext (Puppeteer page model).
 * Only needed for non-diagnostic tools that interact via Puppeteer.
 */
async function getContext(): Promise<McpContext> {
  const gen = getConnectionGeneration();
  if (gen !== contextGeneration) {
    context?.dispose();
    context = undefined;
    contextGeneration = gen;
  }
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
    config.categoryPerformance === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.NETWORK &&
    config.categoryNetwork === false
  ) {
    return;
  }
  if (
    tool.annotations.conditions?.includes('computerVision') &&
    !config.experimentalVision
  ) {
    return;
  }
  // Hide diagnostic tools in production unless explicitly enabled
  if (
    tool.annotations.conditions?.includes('devDiagnostic') &&
    !config.devDiagnostic
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
      const timeoutMs = tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
      let guard: InstanceType<typeof Mutex.Guard> | undefined;
      try {
        // Standalone tools (e.g., wait) don't need VS Code connection
        const isStandalone = tool.annotations.conditions?.includes('standalone');

        // Hot-reload: if the extension source changed since the last snapshot,
        // tear down the debug window, rebuild, and let ensureConnection()
        // spawn a fresh one. This all happens OUTSIDE the tool's timeout so
        // that from Copilot's perspective changes are applied instantly.
        if (!isStandalone && config.explicitExtensionDevelopmentPath) {
          if (hasExtensionChanged(config.extensionBridgePath)) {
            logger('Extension source changed — hot-reloading…');
            await stopDebugWindow();
            await runHostShellTaskOrThrow(config.hostWorkspace, 'ext:build', 300_000);
          }
          saveExtensionSnapshot(config.extensionBridgePath);
        }

        // Ensure VS Code connection (CDP + bridge) OUTSIDE the timeout.
        // This allows the first tool call to wait for Extension Host initialization
        // without eating into the tool's timeout budget.
        if (!isStandalone) {
          await ensureConnection();
        }

        const executeAll = async () => {
          guard = await toolMutex.acquire();
          logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);

          // Standalone tools don't need VS Code connection or UI checks
          if (isStandalone) {
            const response = new McpResponse();
            await tool.handler({params}, response, undefined as never);
            const content: Array<{type: string; text?: string}> = [];
            for (const line of response.responseLines) {
              content.push({type: 'text', text: line});
            }
            if (content.length === 0) {
              content.push({type: 'text', text: '(no output)'});
            }
            return {content};
          }

          // Check for blocking modals/notifications before tool execution
          // BLOCKING modals (e.g., "Save file?") → STOP tool, return modal info
          // NON-BLOCKING notifications (toasts) → Prepend banner, let tool proceed
          //
          // EXCEPTION: Input tools (hotkey, click, hover, drag) BYPASS the gate
          // when there's a blocking UI. This allows the user to dismiss the dialog.
          // Without this, there would be no way to interact with blocking dialogs via MCP.
          const inputTools = ['hotkey', 'click', 'hover', 'drag', 'type', 'scroll'];
          const isInputTool = inputTools.includes(tool.name);
          
          const uiCheck = await checkForBlockingUI();
          if (uiCheck.blocked && !isInputTool) {
            // Blocked and NOT an input tool - return blocking message
            const content: Array<{type: string; text?: string}> = [];
            if (uiCheck.notificationBanner) {
              content.push({type: 'text', text: uiCheck.notificationBanner});
            }
            content.push({type: 'text', text: uiCheck.blockingMessage!});
            return {content};
          }
          // For input tools when blocked: still prepend banner but let tool execute
          const notificationBanner = uiCheck.notificationBanner;

          // Diagnostic and directCdp tools bypass McpContext — they use sendCdp/bridgeExec directly.
          // Non-diagnostic tools need full McpContext (Phase B will refactor this).
          const isDiagnostic = tool.annotations.conditions?.includes('devDiagnostic');
          const isDirectCdp = tool.annotations.conditions?.includes('directCdp');
          const bypassContext = isDiagnostic || isDirectCdp;
          const ctx = bypassContext ? (undefined as never) : await getContext();

          logger(`${tool.name} context: resolved`);
          const response = new McpResponse();
          await tool.handler(
            {
              params,
            },
            response,
            ctx,
          );

          // Diagnostic/directCdp tools return content directly without McpResponse.handle()
          if (bypassContext) {
            const content: Array<{type: string; text?: string; data?: string; mimeType?: string}> = [];
            // Prepend notification banner if present
            if (notificationBanner) {
              content.push({type: 'text', text: notificationBanner});
            }
            for (const line of response.responseLines) {
              content.push({type: 'text', text: line});
            }
            for (const img of response.images) {
              content.push({type: 'image', data: img.data, mimeType: img.mimeType});
            }
            if (content.length === 0) {
              content.push({type: 'text', text: '(no output)'});
            }
            return {content};
          }

          const {content, structuredContent} = await response.handle(
            tool.name,
            ctx,
          );
          // Prepend notification banner for non-bypass tools
          if (notificationBanner) {
            (content as Array<{type: string; text?: string}>).unshift({type: 'text', text: notificationBanner});
          }
          return {content, structuredContent};
        };

        const {content, structuredContent} = await withTimeout(
          executeAll(),
          timeoutMs,
          tool.name,
        ) as {content: CallToolResult['content']; structuredContent?: Record<string, unknown>};

        const result: CallToolResult & {
          structuredContent?: Record<string, unknown>;
        } = {
          content,
        };
        if (config.experimentalStructuredContent) {
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
        guard?.dispose();
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

// Auto-launch VS Code debug window on server start
logger('Launching VS Code debug window...');
if (config.explicitExtensionDevelopmentPath) {
  await runHostShellTaskOrThrow(config.hostWorkspace, 'ext:build', 300_000);
  saveExtensionSnapshot(config.extensionBridgePath);
}
await ensureConnection();
logger('VS Code debug window ready');

logDisclaimers();


