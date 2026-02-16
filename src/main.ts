/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import {exec} from 'node:child_process';
import process from 'node:process';

import {parseArguments} from './cli.js';
import {loadConfig, type ResolvedConfig} from './config.js';
import {hasBuildChangedSinceWindowStart, isBuildStale} from './extension-watcher.js';
import {restartMcpServer} from './host-pipe.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpResponse} from './McpResponse.js';
import {
  consumeHotReloadMarker,
  getMcpServerRoot,
  hasBuildChangedSinceProcessStart,
  hasMcpServerSourceChanged,
  writeHotReloadMarker,
} from './mcp-server-watcher.js';
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
import {getProcessLedger, type ProcessLedgerSummary, type ProcessEntry} from './client-pipe.js';

// Default timeout for tools (30 seconds)
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

// ── Error Snapshot Deduplication ──────────────────────────
// Track the last snapshot sent on error to avoid dumping identical snapshots
// repeatedly. Reset when a new CDP session starts (hot-reload, reconnect).
let lastErrorSnapshotText: string | null = null;
let lastErrorSnapshotGeneration = -1;

// ── MCP Server Self Hot-Reload State ─────────────────────

const mcpServerDir = getMcpServerRoot();
const mcpProcessStartTime = Date.now();
let mcpServerHotReloadInfo: {builtAt: number} | null = null;
let mcpServerRestartScheduled = false;

/**
 * Run `pnpm run build` in the mcp-server directory.
 * Returns stdout/stderr on success, throws on failure.
 */
function runMcpServerBuild(): Promise<{stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    logger(`[mcp-hot-reload] Running build in ${mcpServerDir}`);
    exec(
      'pnpm run build',
      {cwd: mcpServerDir, timeout: 120_000},
      (err, stdout, stderr) => {
        if (err) {
          // Include both stdout and stderr — TypeScript errors go to stdout
          const output = [stdout, stderr].filter(Boolean).join('\n').trim();
          reject(new Error(`MCP server build failed:\n${output}`));
        } else {
          logger('[mcp-hot-reload] Build completed successfully');
          resolve({stdout, stderr});
        }
      },
    );
  });
}

/**
 * Schedule MCP server restart via Host extension RPC.
 * Called after the tool response is sent to give stdio time to flush.
 * Always exits after the RPC so VS Code can respawn the process.
 */
function scheduleMcpServerRestart(): void {
  if (mcpServerRestartScheduled) return;
  mcpServerRestartScheduled = true;
  setTimeout(async () => {
    logger('[mcp-hot-reload] Sending restart RPC to Host extension…');
    try {
      await restartMcpServer();
      logger('[mcp-hot-reload] Restart RPC sent successfully');
    } catch {
      logger('[mcp-hot-reload] Restart RPC failed — exiting anyway');
    }
    // Always exit — VS Code will respawn the MCP server process.
    // If the Host RPC succeeded, VS Code already knows to restart.
    // If it failed, a clean exit lets VS Code detect the crash and respawn.
    logger('[mcp-hot-reload] Exiting process for restart');
    process.exit(0);
  }, 500);
}

/**
 * Format child processes as indented tree lines for a parent process.
 */
function formatChildProcesses(entry: ProcessEntry, indent: string): string[] {
  if (!entry.children || entry.children.length === 0) return [];

  const lines: string[] = [];
  for (const child of entry.children) {
    const cmdLine = child.commandLine
      ? (child.commandLine.length > 60 ? child.commandLine.slice(0, 57) + '...' : child.commandLine)
      : child.name;
    lines.push(`\n${indent}↳ PID ${child.pid} — ${child.name} — \`${cmdLine}\``);
  }
  return lines;
}

/**
 * Format the process ledger summary for inclusion in every MCP response.
 * Shows terminals as parent nodes with their processes as children,
 * giving Copilot full visibility into the terminal ↔ process relationship.
 */
function formatProcessLedger(ledger: ProcessLedgerSummary): string {
  const parts: string[] = [];
  const sessions = ledger.terminalSessions ?? [];

  // Orphaned processes (highest priority — from previous sessions, no terminal)
  if (ledger.orphaned.length > 0) {
    parts.push('\n---');
    parts.push(`\n⚠️ **Orphaned Processes (${ledger.orphaned.length}):**`);
    for (const p of ledger.orphaned) {
      const cmd = p.command.length > 50 ? p.command.slice(0, 47) + '...' : p.command;
      parts.push(`\n• **PID ${p.pid}** (${p.terminalName}) — \`${cmd}\` — from previous session`);
      parts.push(...formatChildProcesses(p, '  '));
    }
  }

  // Terminal sessions as parent nodes with active processes as children
  if (sessions.length > 0 || ledger.active.length > 0) {
    // Track which active processes we've already shown under a terminal
    const shownPids = new Set<number>();

    parts.push('\n---');
    parts.push(`\n📺 **Terminal Sessions (${sessions.length}):**`);

    for (const session of sessions) {
      const shellLabel = session.shell ? ` [${session.shell}]` : '';
      const pidLabel = session.pid ? ` (PID ${session.pid})` : '';
      const activeIcon = session.isActive ? '▶️' : '📺';

      // Find the active process running in this terminal
      const matchedProcess = ledger.active.find(p =>
        (session.pid && p.pid === session.pid) ||
        p.terminalName === session.name ||
        (session.name === 'MCP Terminal' && p.terminalName === 'default') ||
        (session.name === `MCP: ${p.terminalName}`),
      );

      if (matchedProcess) {
        shownPids.add(matchedProcess.pid);
        const cmd = matchedProcess.command.length > 45 ? matchedProcess.command.slice(0, 42) + '...' : matchedProcess.command;
        const childCount = matchedProcess.children?.length ?? 0;
        const childLabel = childCount > 0 ? ` [${childCount} child${childCount > 1 ? 'ren' : ''}]` : '';
        parts.push(`\n${activeIcon} **${session.name}**${shellLabel}${pidLabel}`);
        parts.push(`\n  └─ ${matchedProcess.status}: \`${cmd}\`${childLabel}`);
        parts.push(...formatChildProcesses(matchedProcess, '     '));
      } else if (session.command) {
        const cmd = session.command.length > 40 ? session.command.slice(0, 37) + '...' : session.command;
        parts.push(`\n${activeIcon} **${session.name}**${shellLabel}${pidLabel}`);
        parts.push(`\n  └─ ${session.status}: \`${cmd}\``);
      } else {
        parts.push(`\n${activeIcon} **${session.name}**${shellLabel}${pidLabel} — ${session.status}`);
      }
    }

    // Show any active processes not matched to a terminal session
    const unmatched = ledger.active.filter(p => !shownPids.has(p.pid));
    if (unmatched.length > 0) {
      parts.push(`\n\n🟢 **Unmatched Active Processes (${unmatched.length}):**`);
      for (const p of unmatched) {
        const cmd = p.command.length > 50 ? p.command.slice(0, 47) + '...' : p.command;
        const childCount = p.children?.length ?? 0;
        const childLabel = childCount > 0 ? ` [${childCount} child${childCount > 1 ? 'ren' : ''}]` : '';
        parts.push(`\n• **${p.terminalName}** (PID ${p.pid ?? 'pending'}) — \`${cmd}\` — ${p.status}${childLabel}`);
        parts.push(...formatChildProcesses(p, '  '));
      }
    }
  } else if (ledger.active.length > 0) {
    // Fallback: no terminal sessions data, show processes only
    parts.push('\n---');
    parts.push(`\n🟢 **Active Copilot Processes (${ledger.active.length}):**`);
    for (const p of ledger.active) {
      const cmd = p.command.length > 50 ? p.command.slice(0, 47) + '...' : p.command;
      const childCount = p.children?.length ?? 0;
      const childLabel = childCount > 0 ? ` [${childCount} child${childCount > 1 ? 'ren' : ''}]` : '';
      parts.push(`\n• **${p.terminalName}** (PID ${p.pid ?? 'pending'}) — \`${cmd}\` — ${p.status}${childLabel}`);
      parts.push(...formatChildProcesses(p, '  '));
    }
  }

  // Recently completed (lower priority)
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
  if (ledger.orphaned.length === 0 && sessions.length === 0 && ledger.active.length === 0 && completed.length === 0) {
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

// ── MCP Server Hot-Reload Marker (detect post-restart) ───
// Check this BEFORE initializing lifecycle service so we can pass the flag
const _hotReloadBuildTime = consumeHotReloadMarker(mcpServerDir);
const wasHotReloaded = _hotReloadBuildTime !== null;
if (wasHotReloaded) {
  mcpServerHotReloadInfo = {builtAt: _hotReloadBuildTime};
  const agoSec = Math.round((Date.now() - _hotReloadBuildTime) / 1000);
  logger(`[mcp-hot-reload] Post-restart detected — rebuilt ${agoSec}s ago`);
}

// Initialize lifecycle service with MCP config (target workspace + extension path + launch flags)
// Pass wasHotReloaded so the service uses a fresh timestamp for extension change detection
lifecycleService.init({
  targetWorkspace: config.workspaceFolder,
  extensionPath: config.extensionBridgePath,
  launch: {...config.launch},
  wasHotReloaded,
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
        // ── MCP Server Self Hot-Reload ──────────────────────
        // Before executing ANY tool, check if this server's own source
        // has changed since the last build. If so: rebuild → return
        // "try again" message → schedule restart via Host extension.
        if (!mcpServerRestartScheduled && hasMcpServerSourceChanged(mcpServerDir)) {
          logger(`[tool:${tool.name}] MCP server source changed — triggering self rebuild…`);

          try {
            await runMcpServerBuild();
            writeHotReloadMarker(mcpServerDir);

            // Schedule restart AFTER this response is sent
            scheduleMcpServerRestart();

            return {
              content: [{
                type: 'text',
                text: [
                  '⚡ **MCP server source changed — rebuilt successfully.**',
                  '',
                  'The MCP server will now restart to apply the latest changes.',
                  'Please call the tool again to use the newest version.',
                ].join('\n'),
              }],
            };
          } catch (buildErr) {
            const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
            logger(`[mcp-hot-reload] Build failed: ${msg}`);
            return {
              content: [{type: 'text', text: `❌ **MCP server rebuild failed:**\n\n\`\`\`\n${msg}\n\`\`\``}],
              isError: true,
            };
          }
        }

        // Check 2: Build output newer than this process → manual CLI build.
        // No rebuild needed (already built), just restart to load the new code.
        if (!mcpServerRestartScheduled && hasBuildChangedSinceProcessStart(mcpServerDir, mcpProcessStartTime)) {
          logger(`[tool:${tool.name}] MCP server build updated (manual build) — restarting…`);
          writeHotReloadMarker(mcpServerDir);
          scheduleMcpServerRestart();

          return {
            content: [{
              type: 'text',
              text: [
                '⚡ **MCP server build updated — restart required.**',
                '',
                'A newer build was detected. The MCP server will restart to load the latest code.',
                'Please call the tool again after the restart.',
              ].join('\n'),
            }],
          };
        }

        // If a restart is already pending (rare edge case), short-circuit
        if (mcpServerRestartScheduled) {
          return {
            content: [{
              type: 'text',
              text: '⏳ MCP server is restarting. Please wait a moment and try again.',
            }],
          };
        }

        // Standalone tools (e.g., wait) don't need VS Code connection
        const isStandalone = tool.annotations.conditions?.includes('standalone');

        // Ensure VS Code connection is alive (retries if startup failed).
        // ensureConnection() is idempotent — returns immediately if already connected.
        if (!isStandalone) {
          await ensureConnection();
        }

        // Hot-reload: check two conditions for extension staleness:
        // 1. Source files are newer than build output → needs rebuild + reload
        // 2. Build output is newer than Client window start → needs reload only
        // Either condition triggers handleHotReload() which tells Host to
        // stop Client → build → spawn new Client. If build is already current,
        // the rebuild step is a fast no-op.
        if (!isStandalone && config.explicitExtensionDevelopmentPath) {
          const stale = isBuildStale(config.extensionBridgePath);
          const windowStartedAt = lifecycleService.debugWindowStartedAt;
          const buildNewerThanWindow = !stale
            && windowStartedAt !== undefined
            && hasBuildChangedSinceWindowStart(config.extensionBridgePath, windowStartedAt);

          logger(`[hot-reload] check: stale=${stale}, buildNewerThanWindow=${buildNewerThanWindow}, extDir=${config.extensionBridgePath}`);

          if (stale || buildNewerThanWindow) {
            const reason = stale ? 'source stale' : 'manual build detected';
            logger(`[tool:${tool.name}] Extension needs hot-reload (${reason}) — reloading…`);
            await lifecycleService.handleHotReload();
            logger(`[tool:${tool.name}] Hot-reload complete — reconnected`);
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

        // Inject "just updated" banner on first tool call after hot-reload restart
        if (mcpServerHotReloadInfo) {
          const secondsAgo = Math.round((Date.now() - mcpServerHotReloadInfo.builtAt) / 1000);
          result.content.unshift({
            type: 'text',
            text: `✅ **MCP server was recently updated.** Latest build completed ${secondsAgo}s ago. All tools are now running the newest code.`,
          });
          mcpServerHotReloadInfo = null;
        }

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

        // Snapshot deduplication: only include a full snapshot on error if
        // the CDP session changed (new window / hot-reload) OR the snapshot
        // content differs from the last error snapshot we sent.
        try {
          const currentGeneration = lifecycleService.cdpGeneration;
          const snapshot = await fetchAXTree(false);

          if (snapshot.formatted) {
            const isNewSession = currentGeneration !== lastErrorSnapshotGeneration;
            const isDifferent = snapshot.formatted !== lastErrorSnapshotText;

            if (isNewSession || isDifferent) {
              content.push({
                type: 'text',
                text: `\n## Latest page snapshot\n${snapshot.formatted}`,
              });
              lastErrorSnapshotText = snapshot.formatted;
              lastErrorSnapshotGeneration = currentGeneration;
            }
            // If same session + same snapshot → skip (already sent)
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


