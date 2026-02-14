/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP tools for process management.
 *
 * These tools allow killing processes by PID, including orphaned processes
 * from previous sessions that are still running.
 *
 * - kill_process: Kill a specific process by PID
 * - kill_orphans: Kill all orphaned processes from previous sessions
 */

import {
  killProcess,
  killAllOrphans,
  getProcessLedger,
  pingClient,
  type KillProcessResult,
  type KillOrphansResult,
} from '../client-pipe.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureClientConnection(): Promise<void> {
  const alive = await pingClient();
  if (!alive) {
    throw new Error(
      'Client pipe not available. ' +
      'Make sure the VS Code Extension Development Host window is running.',
    );
  }
}

function formatKillResult(
  result: KillProcessResult,
  pid: number,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({...result, pid}, null, 2);
  }

  if (result.success) {
    return `✅ **Process ${pid} killed successfully.**`;
  } else {
    return `❌ **Failed to kill process ${pid}:** ${result.error ?? 'Unknown error'}`;
  }
}

function formatKillOrphansResult(
  result: KillOrphansResult,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  if (result.killed.length > 0) {
    lines.push(`✅ **Killed ${result.killed.length} orphaned process(es):**`);
    for (const pid of result.killed) {
      lines.push(`  • PID ${pid}`);
    }
  }

  if (result.failed.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`❌ **Failed to kill ${result.failed.length} process(es):**`);
    for (const f of result.failed) {
      lines.push(`  • PID ${f.pid}: ${f.error}`);
    }
  }

  if (result.killed.length === 0 && result.failed.length === 0) {
    lines.push('📋 **No orphaned processes to kill.**');
  }

  return lines.join('\n');
}

// ── kill_process ─────────────────────────────────────────────────────────────

export const kill = defineTool({
  name: 'kill_process',
  description: `Kill a process by PID.

This tool can kill any process that Copilot has started, including:
- Active processes running in MCP-managed terminals
- Orphaned processes from previous VS Code sessions that are still running

Use the process ledger (shown at the end of every tool response) to see available PIDs.

Args:
  - pid (number): The process ID to kill
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - success: Whether the process was killed
  - error: Error message if kill failed

Examples:
  - Kill a process: { pid: 12345 }
  - Kill with JSON output: { pid: 12345, response_format: "json" }`,
  annotations: {
    title: 'Kill Process by PID',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    pid: zod
      .number()
      .int()
      .positive()
      .describe('The process ID (PID) to kill. Use the process ledger to find available PIDs.'),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const pid = request.params.pid;
    const result = await killProcess(pid);

    const formatted = formatKillResult(result, pid, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});

// ── kill_orphans ─────────────────────────────────────────────────────────────

export const killOrphans = defineTool({
  name: 'kill_orphans',
  description: `Kill all orphaned processes from previous VS Code sessions.

Orphaned processes are processes that Copilot started in a previous session
that are still running after VS Code was restarted or the extension was reloaded.

These processes appear in the "Orphaned Processes" section of the process ledger
that is shown at the end of every tool response.

This tool kills ALL orphaned processes in one call.

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - killed: Array of PIDs that were successfully killed
  - failed: Array of { pid, error } for processes that failed to kill

Examples:
  - Kill all orphans: {}
  - Kill with JSON output: { response_format: "json" }`,
  annotations: {
    title: 'Kill All Orphaned Processes',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await killAllOrphans();

    const formatted = formatKillOrphansResult(result, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});

// ── list_processes ───────────────────────────────────────────────────────────

export const listProcesses = defineTool({
  name: 'list_processes',
  description: `List all Copilot-managed processes.

Returns a detailed view of all processes that Copilot is tracking:
- Active: Currently running in MCP-managed terminals
- Orphaned: From previous sessions, still running without a terminal
- Recently Completed: Finished within the current session

Note: The process ledger is automatically appended to every tool response,
so you typically don't need to call this tool explicitly. Use it when you
need detailed information about processes.

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - active: Array of active process entries
  - orphaned: Array of orphaned process entries
  - recentlyCompleted: Array of recently completed process entries
  - sessionId: Current session identifier`,
  annotations: {
    title: 'List Copilot Processes',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const ledger = await getProcessLedger();

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify(ledger, null, 2));
      return;
    }

    const lines: string[] = [];
    lines.push(`## Process Ledger (Session: ${ledger.sessionId})`);
    lines.push('');

    // Orphaned
    if (ledger.orphaned.length > 0) {
      lines.push(`### ⚠️ Orphaned Processes (${ledger.orphaned.length})`);
      lines.push('');
      lines.push('These processes were started in a previous session and are still running:');
      lines.push('');
      for (const p of ledger.orphaned) {
        lines.push(`- **PID ${p.pid}** (${p.terminalName})`);
        lines.push(`  - Command: \`${p.command}\``);
        lines.push(`  - Started: ${p.startedAt}`);
        lines.push(`  - Session: ${p.sessionId}`);
      }
      lines.push('');
      lines.push('> Use `kill_process` or `kill_orphans` to terminate these.');
      lines.push('');
    }

    // Active
    if (ledger.active.length > 0) {
      lines.push(`### 🟢 Active Processes (${ledger.active.length})`);
      lines.push('');
      for (const p of ledger.active) {
        lines.push(`- **${p.terminalName}** (PID ${p.pid ?? 'pending'})`);
        lines.push(`  - Command: \`${p.command}\``);
        lines.push(`  - Status: ${p.status}`);
        lines.push(`  - Started: ${p.startedAt}`);
      }
      lines.push('');
    }

    // Recently completed
    if (ledger.recentlyCompleted.length > 0) {
      lines.push(`### ✅ Recently Completed (${ledger.recentlyCompleted.length})`);
      lines.push('');
      for (const p of ledger.recentlyCompleted) {
        const exitInfo = p.exitCode !== undefined ? `exit ${p.exitCode}` : p.status;
        lines.push(`- **${p.terminalName}** — \`${p.command.slice(0, 50)}\` — ${exitInfo}`);
      }
      lines.push('');
    }

    if (ledger.orphaned.length === 0 && ledger.active.length === 0 && ledger.recentlyCompleted.length === 0) {
      lines.push('📋 **No Copilot-managed processes.**');
    }

    response.appendResponseLine(lines.join('\n'));
  },
});
