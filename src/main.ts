/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import process from 'node:process';

import {parseArguments} from './cli.js';
import {loadConfig, type ResolvedConfig} from './config.js';
import {hasExtensionChangedSince} from './extension-watcher.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpResponse} from './McpResponse.js';
import {startMcpSocketServer} from './mcp-socket-server.js';
import {Mutex} from './Mutex.js';
import {checkForBlockingUI} from './notification-gate.js';
import {lifecycleService} from './services/index.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools} from './tools/tools.js';
import {fetchAXTree} from './ax-tree.js';
import {getProcessLedger, type ProcessLedgerSummary} from './client-pipe.js';

// Default timeout for tools (30 seconds)
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * Format the process ledger summary for inclusion in every MCP response.
 * This provides Copilot constant awareness of all managed processes.
 */
function formatProcessLedger(ledger: ProcessLedgerSummary): string {
  const parts: string[] = [];

  // Format orphaned processes (highest priority - from previous sessions)
  if (ledger.orphaned.length > 0) {
    parts.push('\n---');
    parts.push(`\n⚠️ **Orphaned Processes (${ledger.orphaned.length}):**`);
    for (const p of ledger.orphaned) {
      const cmd = p.command.length > 50 ? p.command.slice(0, 47) + '...' : p.command;
      parts.push(`\n• **PID ${p.pid}** (${p.terminalName}) — \`${cmd}\` — from previous session`);
    }
  }

  // Format active processes
  if (ledger.active.length > 0) {
    parts.push('\n---');
    parts.push(`\n🟢 **Active Copilot Processes (${ledger.active.length}):**`);
    for (const p of ledger.active) {
      const cmd = p.command.length > 50 ? p.command.slice(0, 47) + '...' : p.command;
      parts.push(`\n• **${p.terminalName}** (PID ${p.pid ?? 'pending'}) — \`${cmd}\` — ${p.status}`);
    }
  }

  // Format recently completed (lower priority)
  const completed = ledger.recentlyCompleted.filter(p => p.status === 'completed' || p.status === 'killed');
  if (completed.length > 0) {
    const shown = completed.slice(0, 3);
    parts.push('\n---');
    parts.push(`\n✅ **Recently Completed (${shown.length}/${completed.length}):**`);
    for (const p of shown) {
      const cmd = p.command.length > 40 ? p.command.slice(0, 37) + '...' : p.command;
      const exitInfo = p.exitCode !== undefined ? `exit ${p.exitCode}` : p.status;
      parts.push(`\n• **${p.terminalName}** — \`${cmd}\` — ${exitInfo}`);
    }
  }

  // If nothing to report
  if (ledger.orphaned.length === 0 && ledger.active.length === 0 && completed.length === 0) {
    parts.push('\n---');
    parts.push('\n📋 **No Copilot-managed processes running.**');
  }

  return parts.join('');
}

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

// Initialize lifecycle service with MCP config (target workspace + extension path + launch flags)
lifecycleService.init({
  targetWorkspace: config.workspaceFolder,
  extensionPath: config.extensionBridgePath,
  launch: {...config.launch},
});

// Start MCP socket server so the extension can send commands (e.g. detach-gracefully)
startMcpSocketServer(config.hostWorkspace);

// Register process-level shutdown handlers (stdin end, SIGINT, etc.)
lifecycleService.registerShutdownHandlers();

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting VS Code DevTools MCP Server v${VERSION}`);
logger(`Config: hostWorkspace=${config.hostWorkspace}, targetFolder=${config.workspaceFolder}`);
logger(`Config: extensionBridgePath=${config.extensionBridgePath}, headless=${config.headless}, logFile=${config.logFile ?? '(none)'}`);
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
 * Ensure VS Code debug window is connected (Host pipe + CDP).
 */
async function ensureConnection(): Promise<void> {
  await lifecycleService.ensureConnection();
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

        // Ensure VS Code connection is alive (retries if startup failed).
        // ensureConnection() is idempotent — returns immediately if already connected.
        if (!isStandalone) {
          await ensureConnection();
        }

        // Hot-reload: if the extension source changed since the last snapshot,
        // tell Host to rebuild Client. Host handles stop/build/restart internally.
        // This runs OUTSIDE the tool's timeout so changes feel instant to Copilot.
        if (!isStandalone && config.explicitExtensionDevelopmentPath) {
          const sessionStartedAtMs = lifecycleService.debugWindowStartedAt;
          if (sessionStartedAtMs !== undefined) {
            const changed = hasExtensionChangedSince(config.extensionBridgePath, sessionStartedAtMs);
            logger(`[hot-reload] check: changed=${changed}, session=${new Date(sessionStartedAtMs).toISOString()}, extDir=${config.extensionBridgePath}`);
            if (changed) {
              logger(`[tool:${tool.name}] Extension source changed — hot-reloading…`);
              await lifecycleService.handleHotReload();
              logger(`[tool:${tool.name}] Hot-reload complete — reconnected`);
            }
          } else {
            logger('[hot-reload] skipped — debugWindowStartedAt is undefined (connection not established?)');
          }
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

          // Append process ledger summary to EVERY response (Copilot accountability)
          const ledger = await getProcessLedger();
          const ledgerText = formatProcessLedger(ledger);
          content.push({type: 'text', text: ledgerText});

          return {content};
        };

        const result = await withTimeout(
          executeAll(),
          timeoutMs,
          tool.name,
        );

        return result;
      } catch (err) {
        logger(`[tool:${tool.name}] ERROR: ${err && 'message' in err ? err.message : String(err)}`);
        if (err?.stack) {
          logger(`[tool:${tool.name}] Stack: ${err.stack}`);
        }
        let errorText = err && 'message' in err ? err.message : String(err);
        if ('cause' in err && err.cause) {
          errorText += `\nCause: ${err.cause.message}`;
        }

        const content: CallToolResult['content'] = [
          {type: 'text', text: errorText},
        ];

        // Always attempt a CDP-powered snapshot on errors to give the
        // caller visual context for diagnosis. CDP is independent of the
        // bridge, so it can still work when bridge exec hangs.
        try {
          const snapshot = await fetchAXTree(false);
          if (snapshot.formatted) {
            content.push({
              type: 'text',
              text: `\n## Latest page snapshot\n${snapshot.formatted}`,
            });
          }
        } catch (snapshotErr) {
          logger('Failed to capture snapshot on error:', snapshotErr);
        }

        return {content, isError: true};
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
logger('VS Code DevTools MCP Server connected to stdio transport');

// Best-effort auto-launch: try to start the VS Code debug window now, but
// don't crash the server if it fails (e.g., host VS Code not running yet).
// If this fails, ensureConnection() will retry on the first tool call.
try {
  logger('[startup] Auto-launching VS Code debug window...');
  await ensureConnection();
  logger('[startup] ✓ VS Code debug window is ready');
} catch (err) {
  const message = err && typeof err === 'object' && 'message' in err
    ? (err as Error).message
    : String(err);
  logger(`[startup] ✗ Startup connection failed — will retry on first tool call: ${message}`);
}

logDisclaimers();


