/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP tools for managing VS Code workspace tasks.
 *
 * Four tools for long-running processes (dev servers, watchers, builds):
 * - task_list: List all available workspace tasks with running status
 * - task_run: Start a task by its ID (source:name)
 * - task_output: Get captured output for a running or completed task
 * - task_stop: Stop a running task
 *
 * These tools use the VS Code Task API via the Client pipe RPC bridge.
 * Output is captured via Shell Integration on task terminals.
 */

import {
  taskList,
  taskRun,
  taskGetOutput,
  taskStop,
  pingClient,
  type TaskInfo,
  type TaskRunResult,
  type TaskOutputResult,
  type TaskStopResult,
} from '../client-pipe.js';
import {zod} from '../third_party/index.js';

import {consolidateOutput, toConsolidatedJson, type LogFormat} from '../log-consolidator.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema, logFormatSchema} from './ToolDefinition.js';

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

function formatTaskList(
  tasks: TaskInfo[],
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({tasks}, null, 2);
  }

  if (tasks.length === 0) {
    return 'No tasks found in the workspace.';
  }

  const lines: string[] = [`**${tasks.length} task(s) available:**`, ''];

  for (const task of tasks) {
    const running = task.isRunning ? ' 🟢 **RUNNING**' : '';
    const group = task.group ? ` [${task.group}]` : '';
    const detail = task.detail ? ` — ${task.detail}` : '';

    lines.push(`- \`${task.id}\`${group}${running}${detail}`);
  }

  lines.push('');
  lines.push('> Use `task_run` with the task ID to start a task.');

  return lines.join('\n');
}

function formatTaskRunResult(
  result: TaskRunResult,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  if (result.alreadyRunning) {
    lines.push(`⚠️ Task \`${result.id}\` is already running in its terminal channel.`);
    lines.push('');
    if (result.conflictInfo) {
      if (result.conflictInfo.pid) {
        lines.push(`**PID:** ${result.conflictInfo.pid}`);
      }
      lines.push(`**Started:** ${result.conflictInfo.startedAt}`);
      lines.push('');
      lines.push(result.conflictInfo.message);
      if (result.conflictInfo.outputPreview) {
        lines.push('');
        lines.push('**Recent Output:**');
        lines.push('```');
        lines.push(result.conflictInfo.outputPreview.trim());
        lines.push('```');
      }
    }
    lines.push('');
    lines.push('> Use `task_output` to see full output, or `task_stop` to terminate it before starting a new run.');
  } else {
    lines.push(`✅ Task \`${result.id}\` started successfully.`);
    lines.push(`**Status:** ${result.status}`);
    lines.push('');
    lines.push('> Use `task_output` to monitor progress, or `task_stop` when done.');
  }

  return lines.join('\n');
}

function formatTaskOutput(
  result: TaskOutputResult,
  format: ResponseFormat,
  logFormat?: LogFormat,
): string {
  if (format === ResponseFormat.JSON) {
    if (result.output) {
      const consolidated = consolidateOutput(result.output, {format: logFormat, label: 'Task'});
      if (consolidated.hasCompression) {
        return JSON.stringify({
          ...result,
          output: undefined,
          ...toConsolidatedJson(consolidated),
        }, null, 2);
      }
    }
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push(`**Task:** \`${result.id}\``);
  lines.push(`**Status:** ${result.status}`);
  lines.push(`**Started:** ${result.startedAt}`);

  if (result.pid !== undefined) {
    lines.push(`**PID:** ${result.pid}`);
  }

  if (result.exitCode !== undefined) {
    lines.push(`**Exit Code:** ${result.exitCode}`);
  }

  if (result.output) {
    const consolidated = consolidateOutput(result.output, {format: logFormat, label: 'Task Output'});
    if (consolidated.hasCompression) {
      lines.push('');
      lines.push(consolidated.formatted);
    } else {
      lines.push('\n**Output:**');
      lines.push('```');
      lines.push(result.output);
      lines.push('```');
    }
  } else {
    lines.push('');
    lines.push('_No output captured yet._');
  }

  return lines.join('\n');
}

function formatTaskStopResult(
  result: TaskStopResult,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(result, null, 2);
  }

  if (result.stopped) {
    return `✅ Task \`${result.id}\` has been stopped.`;
  }

  return `⚠️ Task \`${result.id}\` was not running.`;
}

// ── task_list ────────────────────────────────────────────────────────────────

export const list = defineTool({
  name: 'task_list',
  description: `List all available workspace tasks with their current running status.

Discovers tasks from:
- tasks.json definitions (shell, process tasks)
- Auto-detected tasks (npm scripts, gulp tasks, etc.)
- Extension-contributed tasks

Returns each task's ID (source:name), name, source, running status, and group.

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - tasks: Array of { id, name, source, isRunning, detail?, group? }

Examples:
  - List all tasks: {}
  - List as JSON: { response_format: "json" }`,
  timeoutMs: 10_000,
  annotations: {
    title: 'List Workspace Tasks',
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

    const result = await taskList();
    const formatted = formatTaskList(result.tasks, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});

// ── task_run ─────────────────────────────────────────────────────────────────

export const run = defineTool({
  name: 'task_run',
  description: `Run a VS Code workspace task by its ID.

The task ID uses the format "source:name" (e.g., "shell: ext:build", "npm: dev").
Use task_list to discover available task IDs.

If the task is already running, returns without starting a second instance.

Tasks run in their own terminal. Output is captured via Shell Integration and
can be retrieved with task_output.

Args:
  - id (string): The task ID in "source:name" format
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - id: Task identifier
  - name: Task name
  - status: 'running'
  - alreadyRunning: true if task was already running

Examples:
  - Start a build: { id: "shell: ext:build" }
  - Start npm dev: { id: "npm: dev" }`,
  timeoutMs: 15_000,
  annotations: {
    title: 'Run Workspace Task',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    id: zod
      .string()
      .describe(
        'The task ID in "source:name" format. Use task_list to discover available tasks.',
      ),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await taskRun(request.params.id);
    const formatted = formatTaskRunResult(result, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});

// ── task_output ──────────────────────────────────────────────────────────────

export const output = defineTool({
  name: 'task_output',
  description: `Get the captured output for a workspace task.

Works for both running and completed tasks that were started via task_run.
Output includes all terminal content captured via Shell Integration.

Args:
  - id (string): The task ID in "source:name" format
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - id: Task identifier
  - name: Task name
  - status: 'running' | 'completed' | 'failed' | 'stopped'
  - output: Captured terminal output
  - exitCode: Process exit code (when completed)
  - pid: Process ID
  - startedAt: ISO timestamp when task was started

Examples:
  - Check build output: { id: "shell: ext:build" }
  - Check as JSON: { id: "npm: dev", response_format: "json" }
  - Detailed log compression: { id: "shell: ext:build", logFormat: "detailed" }`,
  timeoutMs: 10_000,
  annotations: {
    title: 'Get Task Output',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    id: zod
      .string()
      .describe(
        'The task ID in "source:name" format. Must be a task previously started with task_run.',
      ),
    logFormat: logFormatSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await taskGetOutput(request.params.id);
    const formatted = formatTaskOutput(result, request.params.response_format, request.params.logFormat);
    response.appendResponseLine(formatted);
  },
});

// ── task_stop ────────────────────────────────────────────────────────────────

export const stop = defineTool({
  name: 'task_stop',
  description: `Stop a running workspace task.

Terminates the task's execution. The task's captured output remains available
via task_output after stopping.

Args:
  - id (string): The task ID in "source:name" format
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - id: Task identifier
  - name: Task name
  - stopped: Whether the task was successfully stopped

Examples:
  - Stop a dev server: { id: "npm: dev" }
  - Stop a build: { id: "shell: ext:build" }`,
  timeoutMs: 10_000,
  annotations: {
    title: 'Stop Workspace Task',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    id: zod
      .string()
      .describe(
        'The task ID in "source:name" format. Use task_list to find running tasks.',
      ),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await taskStop(request.params.id);
    const formatted = formatTaskStopResult(result, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});
