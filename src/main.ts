/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import process from 'node:process';

import {parseArguments} from './cli.js';
import {loadConfig, type ResolvedConfig} from './config.js';
import {hasExtensionChanged, saveExtensionSnapshot} from './extension-watcher.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {checkForBlockingUI} from './notification-gate.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools} from './tools/tools.js';
import {ensureVSCodeConnected, stopDebugWindow, runHostShellTaskOrThrow} from './vscode.js';

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

/**
 * Ensure VS Code debug window is connected (CDP + bridge).
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

const logDisclaimers = () => {
  console.error(
    `mcp-server exposes content of the VS Code debug window to MCP clients,
allowing them to inspect, debug, and modify any data visible in the editor.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );
};

const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
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
            await tool.handler({params}, response);
            const content: CallToolResult['content'] = [];
            for (const line of response.responseLines) {
              content.push({type: 'text', text: line});
            }
            if (content.length === 0) {
              content.push({type: 'text', text: '(no output)'});
            }
            return {content};
          }

          // Check for blocking modals/notifications before tool execution.
          // BLOCKING modals (e.g., "Save file?") → STOP tool, return modal info.
          // NON-BLOCKING notifications (toasts) → Prepend banner, let tool proceed.
          //
          // Input tools bypass blocking UI so the user can dismiss dialogs via MCP.
          const inputTools = ['keyboard_hotkey', 'mouse_click', 'mouse_hover', 'mouse_drag', 'keyboard_type', 'mouse_scroll'];
          const isInputTool = inputTools.includes(tool.name);
          
          const uiCheck = await checkForBlockingUI();
          if (uiCheck.blocked && !isInputTool) {
            const content: CallToolResult['content'] = [];
            if (uiCheck.notificationBanner) {
              content.push({type: 'text', text: uiCheck.notificationBanner});
            }
            content.push({type: 'text', text: uiCheck.blockingMessage!});
            return {content};
          }
          const notificationBanner = uiCheck.notificationBanner;

          const response = new McpResponse();
          await tool.handler({params}, response);

          const content: CallToolResult['content'] = [];
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
        };

        const result = await withTimeout(
          executeAll(),
          timeoutMs,
          tool.name,
        );

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

// Best-effort auto-launch: try to start the VS Code debug window now, but
// don't crash the server if it fails (e.g., host VS Code not running yet).
// Tools will lazily call ensureConnection() on their first invocation.
try {
  logger('Launching VS Code debug window...');
  if (config.explicitExtensionDevelopmentPath) {
    await runHostShellTaskOrThrow(config.hostWorkspace, 'ext:build', 300_000);
    saveExtensionSnapshot(config.extensionBridgePath);
  }
  await ensureConnection();
  logger('VS Code debug window ready');
} catch (err) {
  const message = err && typeof err === 'object' && 'message' in err
    ? (err as Error).message
    : String(err);
  logger(`Startup connection failed (will retry on first tool call): ${message}`);
}

logDisclaimers();


