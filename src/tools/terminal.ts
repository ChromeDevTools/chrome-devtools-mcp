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
 * - read_terminal: Read output from any tracked terminal with filtering
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

import {consolidateOutput, toConsolidatedJson, type LogFormat} from '../log-consolidator.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema, logFormatSchema} from './ToolDefinition.js';

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
  logFormat?: LogFormat,
): string {
  if (format === ResponseFormat.JSON) {
    if (result.output) {
      const consolidated = consolidateOutput(result.output, {format: logFormat, label: 'Terminal'});
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

  if (result.name && result.name !== 'default') {
    lines.push(`**Terminal:** ${result.name}`);
  }

  lines.push(`**Status:** ${result.status}`);

  if (result.shell) {
    lines.push(`**Shell:** ${result.shell}`);
  }

  if (result.cwd) {
    lines.push(`**Working Directory:** \`${result.cwd}\``);
  }

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
    lines.push('> A process is still running (background mode). Use `read_terminal` to check progress or `terminal_kill` to stop it.');
  }

  if (result.status === 'timeout') {
    lines.push('');
    lines.push('> ⚠️ Command timed out before completion. The process may still be running. Use `read_terminal` to check or `terminal_kill` to stop it.');
  }

  if (result.output) {
    const consolidated = consolidateOutput(result.output, {format: logFormat, label: 'Terminal Output'});
    if (consolidated.hasCompression) {
      lines.push('');
      lines.push(consolidated.formatted);
    } else {
      lines.push('\n**Output:**');
      lines.push('```');
      lines.push(result.output);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

// ── terminal_run ───────────────────────────────────────────────────────────────

export const run = defineTool({
  name: 'terminal_run',
  description: `Run a PowerShell command in the VS Code terminal from a specific working directory.

\`cwd\` (absolute path) is REQUIRED. All commands run in PowerShell.

By default (waitMode: 'completion'), the tool BLOCKS until the command fully completes,
including a 3-second grace period to catch cascading commands. This means you get the
complete output in a single call without needing to poll read_terminal.

If the command asks for user input (e.g., [Y/n] prompts), it returns immediately
with status "waiting_for_input" and the detected prompt. Use terminal_input to respond.

For long-running dev servers, use waitMode: 'background' to return immediately.

**Response always includes:**
- The working directory the command ran from
- (Via process ledger) A full inventory of all open terminal sessions

Args:
  - cwd (string): **REQUIRED.** Absolute path to the working directory.
  - command (string): The PowerShell command to execute.
  - timeout (number): Max wait time in milliseconds. Default: 120000 (2 minutes)
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - waitMode ('completion'|'background'): Default 'completion' blocks until done
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'completed' | 'running' | 'waiting_for_input' | 'timeout'
  - shell: Always 'powershell'
  - output: Terminal output text
  - cwd: The working directory the command ran from
  - exitCode: Process exit code (when completed)
  - prompt: Detected prompt text (when waiting_for_input)
  - pid: Process ID
  - name: Terminal name
  - durationMs: How long the command ran

Examples:
  - Build: { cwd: "C:\\\\project", command: "npm run build" }
  - Dev server: { cwd: "C:\\\\app", command: "npm run dev", waitMode: "background" }`,
  timeoutMs: 130_000,
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
    cwd: zod
      .string()
      .refine(
        (path) => {
          return /^(?:[a-zA-Z]:[/\\]|\/)/u.test(path);
        },
        {
          message: 'cwd must be an absolute path (e.g., "C:\\\\project" or "/home/user/app")',
        },
      )
      .describe(
        '**REQUIRED.** Absolute path to the working directory. ' +
        'The command will execute from this directory to ensure deterministic behavior.',
      ),
    command: zod
      .string()
      .describe('The PowerShell command to execute.'),
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
    logFormat: logFormatSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalRun(
      request.params.command,
      request.params.cwd,
      request.params.timeout,
      request.params.name,
      request.params.waitMode,
    );

    const formatted = formatTerminalResult(result, request.params.response_format, request.params.logFormat);
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
  - Named terminal: { text: "y", name: "dev-server" }
  - Detailed log compression: { text: "y", logFormat: "detailed" }`,
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
    logFormat: logFormatSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalInput(
      request.params.text,
      request.params.addNewline,
      request.params.timeout,
      request.params.name,
    );

    const formatted = formatTerminalResult(result, request.params.response_format, request.params.logFormat);
    response.appendResponseLine(formatted);
  },
});

// ── read_terminal ────────────────────────────────────────────────────────────

export const readTerminal = defineTool({
  name: 'read_terminal',
  description: `Read the current output and state of any tracked terminal.

Use this to:
- Check if a previously started command has finished
- See the latest output from a running or completed process
- Determine if the terminal is waiting for input
- Search terminal output for specific patterns
- Get just the last N lines of output

Args:
  - name (string): Terminal name. Default: 'default'
  - limit (number): Return only the last N lines of output
  - pattern (string): Regex pattern to filter output lines (case-insensitive)
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'idle' (no terminal), 'running', 'completed', or 'waiting_for_input'
  - output: Terminal output (optionally filtered)
  - exitCode: Process exit code (if completed)
  - prompt: Detected prompt (if waiting for input)
  - pid: Process ID
  - name: Terminal name

Examples:
  - Check default terminal: {}
  - Check named terminal: { name: "dev-server" }
  - Last 20 lines: { limit: 20 }
  - Find errors: { pattern: "error|fail|exception", limit: 50 }
  - Named terminal + filter: { name: "build", pattern: "warning", limit: 100 }`,
  annotations: {
    title: 'Read Terminal Output',
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
    limit: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Return only the last N lines of output. Omit to get all output.'),
    pattern: zod
      .string()
      .optional()
      .describe('Regex pattern to filter output lines (case-insensitive).'),
    logFormat: logFormatSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalGetState(request.params.name);

    // Apply line-level filtering if limit or pattern is specified
    if (result.output && (request.params.limit || request.params.pattern)) {
      let lines = result.output.split('\n');

      if (request.params.pattern) {
        const regex = new RegExp(request.params.pattern, 'i');
        lines = lines.filter(line => regex.test(line));
      }

      if (request.params.limit) {
        lines = lines.slice(-request.params.limit);
      }

      result.output = lines.join('\n');
    }

    const formatted = formatTerminalResult(result, request.params.response_format, request.params.logFormat);
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
    logFormat: logFormatSchema,
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await terminalKill(request.params.name);

    const formatted = formatTerminalResult(result, request.params.response_format, request.params.logFormat);
    response.appendResponseLine(formatted);
  },
});
