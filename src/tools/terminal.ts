/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP tools for the single-terminal model.
 *
 * Four tools manage one persistent terminal with prompt detection:
 * - terminal_run: Execute a command, wait for completion/prompt/timeout
 * - terminal_input: Send input to a waiting prompt
 * - terminal_state: Check current terminal state
 * - terminal_kill: Send Ctrl+C to stop the running process
 *
 * These tools communicate with the Client extension via the Client pipe,
 * using typed RPC methods (terminal.run, terminal.input, etc.).
 */

import {
  terminalRun,
  terminalInput,
  terminalGetState,
  terminalKill,
  pingClient,
  type TerminalRunResult,
} from '../client-pipe.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const nameSchema = zod
  .string()
  .optional()
  .describe(
    'Optional terminal name. Each named terminal runs independently with its own state and output history. ' +
    'Default: "default". Use different names to run multiple commands concurrently.',
  );

async function ensureClientConnection(): Promise<void> {
  const alive = await pingClient();
  if (!alive) {
    throw new Error(
      'Client pipe not available. ' +
      'Make sure the VS Code Extension Development Host window is running.',
    );
  }
}

function formatTerminalResult(
  result: TerminalRunResult,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  if (result.name && result.name !== 'default') {
    lines.push(`**Terminal:** ${result.name}`);
  }

  lines.push(`**Status:** ${result.status}`);

  if (result.pid !== undefined) {
    lines.push(`**PID:** ${result.pid}`);
  }

  if (result.exitCode !== undefined) {
    lines.push(`**Exit Code:** ${result.exitCode}`);
  }

  if (result.durationMs !== undefined) {
    const seconds = (result.durationMs / 1000).toFixed(1);
    lines.push(`**Duration:** ${seconds}s`);
  }

  if (result.prompt) {
    lines.push(`**Detected Prompt:** \`${result.prompt}\``);
    lines.push('');
    lines.push('> The terminal is waiting for input. Use `terminal_input` to respond.');
  }

  if (result.status === 'running') {
    lines.push('');
    lines.push('> A process is still running (background mode). Use `terminal_state` to check progress or `terminal_kill` to stop it.');
  }

  if (result.status === 'timeout') {
    lines.push('');
    lines.push('> ⚠️ Command timed out before completion. The process may still be running. Use `terminal_state` to check or `terminal_kill` to stop it.');
  }

  if (result.output) {
    lines.push('');
    lines.push('**Output:**');
    lines.push('```');
    lines.push(result.output);
    lines.push('```');
  }

  return lines.join('\n');
}

// ── terminal_run ─────────────────────────────────────────────────────────────

export const run = defineTool({
  name: 'terminal_run',
  description: `Run a command in the VS Code terminal. Creates the terminal if needed.

By default (waitMode: 'completion'), the tool BLOCKS until the command fully completes,
including a 3-second grace period to catch cascading commands. This means you get the
complete output in a single call without needing to poll terminal_state.

If the command asks for user input (e.g., [Y/n] prompts), it returns immediately
with status "waiting_for_input" and the detected prompt. Use terminal_input to respond.

For long-running dev servers, use waitMode: 'background' to return immediately.

Args:
  - command (string): The shell command to execute
  - timeout (number): Max wait time in milliseconds. Default: 120000 (2 minutes)
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - waitMode ('completion'|'background'): Default 'completion' blocks until done
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'completed' | 'running' | 'waiting_for_input' | 'timeout'
  - output: Terminal output text
  - exitCode: Process exit code (when completed)
  - prompt: Detected prompt text (when waiting_for_input)
  - pid: Process ID
  - name: Terminal name
  - durationMs: How long the command ran

Examples:
  - Run a build: { command: "npm run build" }
  - Quick command: { command: "echo hello", timeout: 5000 }
  - Interactive install: { command: "npm init" } → returns waiting_for_input
  - Named terminal: { command: "npm run dev", name: "dev-server" }
  - Dev server (background): { command: "npm run dev", name: "dev", waitMode: "background" }`,
  timeoutMs: 130_000, // Slightly higher than default 120s timeout
  annotations: {
    title: 'Run Terminal Command',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    command: zod
      .string()
      .describe('The shell command to execute in the terminal.'),
    timeout: zod
      .number()
      .int()
      .min(1000)
      .max(300_000)
      .optional()
      .describe(
        'Maximum wait time in milliseconds for the command to complete. Default: 120000 (2 minutes). ' +
        'For long-running commands, increase this value.',
      ),
    name: nameSchema,
    waitMode: zod
      .enum(['completion', 'background'])
      .optional()
      .default('completion')
      .describe(
        "Wait mode: 'completion' (default) blocks until command finishes; " +
        "'background' returns immediately for long-running processes like dev servers.",
      ),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalRun(
      request.params.command,
      request.params.timeout,
      request.params.name,
      request.params.waitMode,
    );

    const formatted = formatTerminalResult(result, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});

// ── terminal_input ───────────────────────────────────────────────────────────

export const input = defineTool({
  name: 'terminal_input',
  description: `Send input to a terminal that is waiting for user input.

Use this after terminal_run returns status "waiting_for_input" (e.g., answering
a [Y/n] prompt, entering a password, or providing interactive input).

After sending the input, waits for the next completion or prompt.

Args:
  - text (string): The text to send to the terminal
  - addNewline (boolean): Whether to press Enter after the text. Default: true
  - timeout (number): Max wait time in milliseconds. Default: 30000
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  Same as terminal_run — status, output, exitCode, prompt, pid, name

Examples:
  - Answer yes: { text: "y" }
  - Enter a value: { text: "my-project-name" }
  - Send without Enter: { text: "partial", addNewline: false }
  - Named terminal: { text: "y", name: "dev-server" }`,
  timeoutMs: 40_000,
  annotations: {
    title: 'Send Terminal Input',
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    text: zod
      .string()
      .describe(
        'The text to send to the terminal. For interactive prompts, this is typically ' +
        '"y", "n", a filename, a version number, etc.',
      ),
    addNewline: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to press Enter after the text. Default: true. ' +
        'Set to false for partial input or when Enter should not be sent.',
      ),
    timeout: zod
      .number()
      .int()
      .min(1000)
      .max(300_000)
      .optional()
      .describe(
        'Maximum wait time in milliseconds after sending input. Default: 30000.',
      ),
    name: nameSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalInput(
      request.params.text,
      request.params.addNewline,
      request.params.timeout,
      request.params.name,
    );

    const formatted = formatTerminalResult(result, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});

// ── terminal_state ───────────────────────────────────────────────────────────

export const state = defineTool({
  name: 'terminal_state',
  description: `Check the current state of the terminal without modifying anything.

Use this to:
- Check if a previously started command has finished
- See the latest output from a running process
- Determine if the terminal is waiting for input

Args:
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'idle' (no terminal), 'running', 'completed', or 'waiting_for_input'
  - output: Current terminal output
  - exitCode: Process exit code (if completed)
  - prompt: Detected prompt (if waiting for input)
  - pid: Process ID
  - name: Terminal name`,
  annotations: {
    title: 'Check Terminal State',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    name: nameSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalGetState(request.params.name);

    const formatted = formatTerminalResult(result, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});

// ── terminal_kill ────────────────────────────────────────────────────────────

export const kill = defineTool({
  name: 'terminal_kill',
  description: `Send Ctrl+C to stop the running process in a terminal.

Use this when:
- A command is taking too long
- You need to cancel a running process before starting a new one
- terminal_run returned status "running" (timed out without completing)

The terminal itself is preserved for reuse — only the running process is interrupted.

Args:
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'completed' (after Ctrl+C)
  - output: Final terminal output
  - pid: Process ID
  - name: Terminal name`,
  annotations: {
    title: 'Kill Terminal Process',
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    name: nameSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalKill(request.params.name);

    const formatted = formatTerminalResult(result, request.params.response_format);
    response.appendResponseLine(formatted);
  },
});
