/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import process from 'node:process';

import {parseArguments} from './cli.js';
import {loadConfig, getMcpServerRoot, type ResolvedConfig} from './config.js';
import {checkForChanges, readyToRestart} from './host-pipe.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger} from './logger.js';
import {McpResponse} from './McpResponse.js';
import {startMcpSocketServer} from './mcp-socket-server.js';
import {checkForBlockingUI} from './notification-gate.js';
import {lifecycleService} from './services/index.js';
import {RequestPipeline} from './services/requestPipeline.js';
import {
  McpServer,
  StdioServerTransport,
  StreamableHTTPServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools} from './tools/tools.js';
import {fetchAXTree} from './ax-tree.js';
import {getProcessLedger, registerClientRecoveryHandler, ensureClientAvailable, type ProcessLedgerSummary, type ProcessEntry} from './client-pipe.js';

// Default timeout for tools (30 seconds)
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

// ── Error Snapshot Deduplication ──────────────────────────
// Track the last snapshot sent on error to avoid dumping identical snapshots
// repeatedly. Reset when a new CDP session starts (hot-reload, reconnect).
let lastErrorSnapshotText: string | null = null;
let lastErrorSnapshotGeneration = -1;

// ── MCP Server Root ──────────────────────────────────────
const mcpServerDir = getMcpServerRoot();

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

  // If nothing to report, return empty string (no notification)
  if (ledger.orphaned.length === 0 && sessions.length === 0 && ledger.active.length === 0 && completed.length === 0) {
    return '';
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

// Parse CLI args and load config from .devtools/ config files
const cliArgs = parseArguments(VERSION);
export const config: ResolvedConfig = loadConfig(cliArgs);

// Legacy export for backwards compatibility
const args = cliArgs;

// Initialize lifecycle service with MCP config (target workspace + extension path + launch flags)
lifecycleService.init({
  clientWorkspace: config.clientWorkspace,
  extensionPath: config.extensionBridgePath,
  launch: {...config.launch},
  wasHotReloaded: false,
});

// Start MCP socket server so the extension can send commands (e.g. detach-gracefully)
startMcpSocketServer(config.hostWorkspace);

// Register process-level shutdown handlers (stdin end, SIGINT, etc.)
lifecycleService.registerShutdownHandlers();

// Wire up auto-recovery: when any tool detects the Client pipe is dead,
// the recovery handler asks the Host to restart the Client window.
registerClientRecoveryHandler(async () => {
  await lifecycleService.recoverClientConnection();
});

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting VS Code DevTools MCP Server v${VERSION}`);
logger(`Config: hostWorkspace=${config.hostWorkspace}, clientWorkspace=${config.clientWorkspace}`);
logger(`Config: extensionBridgePath=${config.extensionBridgePath}, headless=${config.headless}`);
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

// ── Request Pipeline ─────────────────────────────────────
// Single unified FIFO queue for all tool calls (replaces all 4 old mutexes).
// Both the stdio server (Copilot) and inspector HTTP server share this instance.
// Closure set by startInspectorServer() so pipeline can close HTTP on restart.
let inspectorShutdownFn: (() => Promise<void>) | null = null;

const pipeline = new RequestPipeline({
  checkForChanges: (mcpRoot, extPath) => checkForChanges(mcpRoot, extPath),
  readyToRestart: () => readyToRestart(),
  onShutdown: async () => {
    if (inspectorShutdownFn) {
      await inspectorShutdownFn();
    }
  },
  mcpServerRoot: mcpServerDir,
  extensionPath: config.extensionBridgePath,
  hotReloadEnabled: config.hotReload.enabled && config.explicitExtensionDevelopmentPath,
  onBeforeChangeCheck: () => {
    lifecycleService.suppressCdpDisconnectDuringChangeCheck();
  },
  onAfterChangeCheck: async (result) => {
    lifecycleService.resumeCdpDisconnectHandling();
    if (result.extClientReloaded && result.newCdpPort) {
      await lifecycleService.reconnectAfterExtensionReload(
        result.newCdpPort,
        result.newClientStartedAt,
      );
    }
  },
});

function registerTool(targetServer: McpServer, tool: ToolDefinition): void {
  if (
    tool.annotations.conditions?.includes('computerVision') &&
    !config.experimentalVision
  ) {
    return;
  }
  if (
    tool.annotations.conditions?.includes('devDiagnostic') &&
    !config.devDiagnostic
  ) {
    return;
  }
  targetServer.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params, extra): Promise<CallToolResult> => {
      const timeoutMs = tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

      return pipeline.submit(tool.name, async () => {
        // Everything inside execute() runs AFTER pipeline dequeues and
        // hot-reload check completes. Timeouts start here, not when
        // the tool entered the queue.
        try {
          const executeBody = async (): Promise<CallToolResult> => {
            logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);

            const isStandalone = tool.annotations.conditions?.includes('standalone');

            // Ensure VS Code connection is alive
            if (!isStandalone) {
              await ensureConnection();
            }

            // Ensure Client pipe is alive for tools that need it
            const needsClientPipe = tool.annotations.conditions?.includes('client-pipe');
            if (needsClientPipe) {
              await ensureClientAvailable();
            }

            // Standalone tools don't need VS Code connection or UI checks
            if (isStandalone) {
              const response = new McpResponse();
              await tool.handler({params}, response, extra);
              const content: CallToolResult['content'] = [];
              for (const line of response.responseLines) {
                content.push({type: 'text', text: line});
              }
              if (content.length === 0) {
                content.push({type: 'text', text: '(no output)'});
              }
              return {content};
            }

            // Check for blocking modals/notifications before tool execution
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
            await tool.handler({params}, response, extra);

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

            // Append process ledger summary unless tool opted out
            if (!response.skipLedger) {
              const ledger = await getProcessLedger();
              const ledgerText = formatProcessLedger(ledger);
              if (ledgerText) {
                content.push({type: 'text', text: ledgerText});
              }
            }

            return {content};
          };

          // Apply timeout — starts AFTER pipeline dequeue + hot-reload check
          const isCodebaseTool = tool.annotations.conditions?.includes('codebase-sequential');
          if (isCodebaseTool) {
            // Codebase tools manage their own dynamic timeout internally
            return await executeBody();
          }
          return await withTimeout(executeBody(), timeoutMs, tool.name);

        } catch (err) {
          const typedErr = err instanceof Error ? err : new Error(String(err));
          logger(`[tool:${tool.name}] ERROR: ${typedErr.message}`);
          if (typedErr.stack) {
            logger(`[tool:${tool.name}] Stack: ${typedErr.stack}`);
          }
          let errorText = typedErr.message;
          if ('cause' in typedErr && typedErr.cause instanceof Error) {
            errorText += `\nCause: ${typedErr.cause.message}`;
          }

          // Detect build failures and format them with full logs
          const buildFailureMatch = errorText.match(/Build failed:\n?([\s\S]*)/);
          if (buildFailureMatch) {
            const buildLogs = buildFailureMatch[1].trim();
            return {
              content: [{type: 'text', text: `❌ **Extension build failed.** Full build output:\n\n\`\`\`\n${buildLogs}\n\`\`\``}],
              isError: true,
            };
          }

          const content: CallToolResult['content'] = [{type: 'text', text: errorText}];

          // Snapshot deduplication: include snapshot on error only if
          // the CDP session changed or snapshot content differs
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
            }
          } catch (snapshotErr) {
            logger('Failed to capture snapshot on error:', snapshotErr);
          }

          return {content, isError: true};
        }
      });
    },
  );
}

for (const tool of tools) {
  registerTool(server, tool);
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

// ── Inspector HTTP Server (Streamable HTTP transport) ────────────────
// Exposes the same tools on a separate Streamable HTTP endpoint so
// MCP Inspector (browser-based) can connect to this running server
// instance without spawning a second process. Each Inspector browser
// session gets its own McpServer + StreamableHTTPServerTransport that
// share the same module-level state (connection, pipeline, etc.).
const INSPECTOR_HTTP_PORT = 6274;

function startInspectorServer(): void {
  const sessions = new Map<string, {transport: StreamableHTTPServerTransport; mcpServer: McpServer}>();

  const httpServer = createServer(async (req, res) => {
    // CORS headers — Inspector runs in a browser on a different origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, mcp-protocol-version');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://localhost:${INSPECTOR_HTTP_PORT}`);
    if (url.pathname !== '/mcp') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    try {
      const sessionId = typeof req.headers['mcp-session-id'] === 'string'
        ? req.headers['mcp-session-id']
        : undefined;

      // Route to existing session
      if (sessionId) {
        const entry = sessions.get(sessionId);
        if (entry) {
          await entry.transport.handleRequest(req, res);
          return;
        }
        // Unknown session — per spec, 404
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {code: -32000, message: 'Session not found'},
        }));
        return;
      }

      // New session: create a dedicated McpServer + transport pair
      const inspectorTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, {transport: inspectorTransport, mcpServer: inspectorMcp});
          logger(`[inspector] New session: ${sid.substring(0, 8)}…`);
        },
        onsessionclosed: (sid: string) => {
          sessions.delete(sid);
          logger(`[inspector] Session ${sid.substring(0, 8)}… closed`);
        },
      });
      const inspectorMcp = new McpServer(
        {name: 'vscode_devtools', title: 'VS Code DevTools MCP server', version: VERSION},
        {capabilities: {logging: {}}},
      );
      inspectorMcp.server.setRequestHandler(SetLevelRequestSchema, () => ({}));

      for (const tool of tools) {
        registerTool(inspectorMcp, tool);
      }

      await inspectorMcp.connect(inspectorTransport);
      await inspectorTransport.handleRequest(req, res);
    } catch (err) {
      logger(`[inspector] Request error: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {code: -32603, message: 'Internal error'},
        }));
      }
    }
  });

  httpServer.listen(INSPECTOR_HTTP_PORT, () => {
    logger(`[inspector] MCP Inspector endpoint ready at http://localhost:${INSPECTOR_HTTP_PORT}/mcp`);
  });

  // Wire HTTP server shutdown so the pipeline can close it before process.exit()
  inspectorShutdownFn = () =>
    new Promise<void>((resolve) => {
      for (const [sid, entry] of sessions) {
        entry.transport.close?.();
        sessions.delete(sid);
      }
      httpServer.close(() => {
        logger('[inspector] HTTP server closed for restart');
        resolve();
      });
      // If close hangs, force-resolve after 3s
      setTimeout(resolve, 3000);
    });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger(`[inspector] ⚠ Port ${INSPECTOR_HTTP_PORT} in use — Inspector HTTP endpoint not available`);
    } else {
      logger(`[inspector] HTTP server error: ${err.message}`);
    }
  });
}

startInspectorServer();

