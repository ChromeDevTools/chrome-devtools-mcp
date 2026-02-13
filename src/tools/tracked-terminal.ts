/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP tools for creating and interacting with tracked terminals.
 *
 * Tracked terminals use a PTY proxy (node-pty) that captures all I/O
 * in the extension's TerminalBufferService, enabling output reading
 * regardless of terminal panel visibility.
 *
 * These tools communicate with the extension via bridge exec, accessing
 * the __trackedTerminalBridge object exposed on globalThis by runtime.ts.
 */

import {bridgeExec} from '../bridge-client.js';
import {zod} from '../third_party/index.js';
import {getDevhostBridgePath} from '../vscode.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

function ensureBridge(): string {
  const bridgePath = getDevhostBridgePath();
  if (!bridgePath) {
    throw new Error(
      'Development host bridge not available. ' +
      'Make sure the VS Code debug window is running.',
    );
  }
  return bridgePath;
}

const BRIDGE_CHECK = `
if (!globalThis.__trackedTerminalBridge) {
  throw new Error('Tracked terminal system not initialized. The VS Code DevTools runtime may not be loaded.');
}
`;

// ── Terminal Output Cleaning ─────────────────────────────────────────────────

// CSI sequences: ESC [ <params> <intermediate> <final byte>
const CSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g;

// OSC sequences: ESC ] ... (BEL | ST)
// ST = ESC \ or \x9c
const OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\|\x9c)/g;

// DCS / PM / APC / SOS sequences: ESC (P|^|_|X) ... ST
const DCS_RE = /\x1b[P^_X][\s\S]*?(?:\x1b\\|\x9c)/g;

// Two-character ESC sequences (e.g., ESC =, ESC >)
const ESC2_RE = /\x1b[\x20-\x7e]/g;

// Non-printable control characters (except \n and \t)
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Convert raw PTY output into clean, human-readable text.
 *
 * Strips ANSI escape sequences (CSI, OSC, DCS, etc.), handles carriage-return
 * line overwriting (\r without \n), normalises CRLF → LF, and removes
 * non-printable control characters.
 */
function cleanTerminalOutput(raw: string): string {
  // 1. Strip escape sequences (order matters — longer patterns first)
  let text = raw
    .replace(DCS_RE, '')
    .replace(OSC_RE, '')
    .replace(CSI_RE, '')
    .replace(ESC2_RE, '');

  // 2. Normalise CRLF → LF  (must happen before bare-\r handling)
  text = text.replace(/\r\n/g, '\n');

  // 3. Simulate carriage-return overwriting on each line.
  //    "abc\rXY" → "XYc"  (XY overwrites a,b from column 0)
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('\r')) continue;

    const segments = line.split('\r');
    const chars: string[] = [];
    for (const seg of segments) {
      if (seg === '') continue;
      for (let c = 0; c < seg.length; c++) {
        chars[c] = seg[c];
      }
    }
    lines[i] = chars.join('');
  }
  text = lines.join('\n');

  // 4. Strip remaining non-printable control characters
  text = text.replace(CTRL_RE, '');

  // 5. Collapse runs of 3+ blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// list_tracked_terminals
// ─────────────────────────────────────────────────────────────────────────────

interface TrackedTerminalMetadata {
  id: string;
  name: string;
  shellPath: string;
  cwd: string;
  createdAt: number;
  pid?: number;
  exitCode?: number;
  isRunning: boolean;
}

export const listTrackedTerminals = defineTool({
  name: 'list_tracked_terminals',
  description: `List all tracked terminals with their metadata and status.

Returns terminals created via create_tracked_terminal with:
- Terminal ID, name, shell path
- Current working directory
- Process ID and running status
- Exit code (if exited)

These terminals have full output capture — use get_terminal_buffer to read their content.`,
  timeoutMs: 5000,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['standalone'],
  },
  schema: {
    response_format: responseFormatSchema,
    runningOnly: zod
      .boolean()
      .optional()
      .describe('Only show running terminals. Default: false.'),
  },
  handler: async (request, response) => {
    const bridgePath = ensureBridge();

    const result = await bridgeExec(
      bridgePath,
      `${BRIDGE_CHECK}
      const bridge = globalThis.__trackedTerminalBridge;
      return payload.runningOnly
        ? bridge.listRunningTerminals()
        : bridge.listTerminals();`,
      {runningOnly: request.params.runningOnly ?? false},
    );

    const terminals = (result ?? []) as TrackedTerminalMetadata[];

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({total: terminals.length, terminals}, null, 2));
      return;
    }

    response.appendResponseLine('## Tracked Terminals');
    response.appendResponseLine('');

    if (terminals.length === 0) {
      response.appendResponseLine(
        '_No tracked terminals. Use create_tracked_terminal to create one._',
      );
      return;
    }

    response.appendResponseLine(`Found **${terminals.length}** tracked terminal(s)`);
    response.appendResponseLine('');

    for (const t of terminals) {
      const status = t.isRunning ? '🟢' : '⚫';
      response.appendResponseLine(`### ${status} ${t.name}`);
      response.appendResponseLine(`- **ID:** \`${t.id}\``);
      response.appendResponseLine(`- **Shell:** ${t.shellPath}`);
      response.appendResponseLine(`- **CWD:** ${t.cwd}`);
      if (t.pid) response.appendResponseLine(`- **PID:** ${t.pid}`);
      if (!t.isRunning && t.exitCode !== undefined) {
        response.appendResponseLine(`- **Exit Code:** ${t.exitCode}`);
      }
      response.appendResponseLine('');
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// create_tracked_terminal
// ─────────────────────────────────────────────────────────────────────────────

export const createTrackedTerminal = defineTool({
  name: 'create_tracked_terminal',
  description: `Create a new tracked terminal with full I/O capture.

Unlike standard terminals, tracked terminals store all output in a buffer
that can be read via get_terminal_buffer even when the terminal is not visible.

The terminal opens with a real shell (PowerShell on Windows, bash/zsh on Unix)
and behaves identically to a normal VS Code terminal.

Returns the terminal ID for use with other tracked terminal tools.`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  schema: {
    response_format: responseFormatSchema,
    name: zod
      .string()
      .optional()
      .describe('Terminal display name. Default: "Tracked Terminal".'),
    shellPath: zod
      .string()
      .optional()
      .describe('Path to shell executable (e.g., "pwsh", "/bin/zsh"). Default: system shell.'),
    cwd: zod
      .string()
      .optional()
      .describe('Working directory. Default: workspace root.'),
  },
  handler: async (request, response) => {
    const bridgePath = ensureBridge();
    const {name, shellPath, cwd} = request.params;

    const result = await bridgeExec(
      bridgePath,
      `${BRIDGE_CHECK}
      const bridge = globalThis.__trackedTerminalBridge;
      return bridge.createTerminal({
        name: payload.name,
        shellPath: payload.shellPath,
        cwd: payload.cwd,
      });`,
      {name, shellPath, cwd},
    );

    const created = result as {terminalId: string; name: string};

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify(created, null, 2));
      return;
    }

    response.appendResponseLine(`✅ Created tracked terminal: **${created.name}**`);
    response.appendResponseLine('');
    response.appendResponseLine(`Terminal ID: \`${created.terminalId}\``);
    response.appendResponseLine('');
    response.appendResponseLine(
      'Use `get_terminal_buffer` to read output, or `send_to_tracked_terminal` to send commands.',
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// get_terminal_buffer
// ─────────────────────────────────────────────────────────────────────────────

export const getTerminalBuffer = defineTool({
  name: 'get_terminal_buffer',
  description: `Read the output buffer from a tracked terminal.

Retrieves all captured output from the terminal, regardless of whether
it is currently visible or selected in the panel.

Options:
- lastN: Only get the last N output chunks
- includeMetadata: Include terminal metadata (name, cwd, status)

The output includes ANSI escape codes for formatting. Use this to check
command results, build output, server logs, or any terminal content.`,
  // NOTE: output is cleaned (ANSI stripped) before returning to the caller.
  timeoutMs: 5000,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  schema: {
    response_format: responseFormatSchema,
    terminalId: zod
      .string()
      .describe('The terminal ID from create_tracked_terminal or list_tracked_terminals.'),
    lastN: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Only return the last N output chunks. Omit for all output.'),
    includeMetadata: zod
      .boolean()
      .optional()
      .describe('Include terminal metadata in response. Default: false.'),
  },
  handler: async (request, response) => {
    const bridgePath = ensureBridge();
    const {terminalId, lastN, includeMetadata} = request.params;

    const result = await bridgeExec(
      bridgePath,
      `${BRIDGE_CHECK}
      const bridge = globalThis.__trackedTerminalBridge;
      const buffer = bridge.getBuffer(payload.terminalId);
      if (!buffer) return null;

      const output = bridge.getOutput(payload.terminalId, {
        lastN: payload.lastN,
        asString: true,
      });

      return {
        output: output || '',
        metadata: payload.includeMetadata ? buffer.metadata : undefined,
        inputHistory: buffer.input,
      };`,
      {terminalId, lastN, includeMetadata: includeMetadata ?? false},
    );

    if (!result) {
      throw new Error(
        `Terminal ${terminalId} not found. ` +
        'Use list_tracked_terminals to see available terminals.',
      );
    }

    const data = result as {
      output: string;
      metadata?: {name: string; cwd: string; isRunning: boolean; shellPath: string};
      inputHistory: string[];
    };

    const cleaned = cleanTerminalOutput(data.output);

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(
        JSON.stringify({...data, output: cleaned}, null, 2),
      );
      return;
    }

    if (data.metadata) {
      response.appendResponseLine(`## Terminal: ${data.metadata.name}`);
      response.appendResponseLine(
        `- **Status:** ${data.metadata.isRunning ? '🟢 Running' : '⚫ Stopped'}`,
      );
      response.appendResponseLine(`- **Shell:** ${data.metadata.shellPath}`);
      response.appendResponseLine(`- **CWD:** ${data.metadata.cwd}`);
      response.appendResponseLine('');
    }

    response.appendResponseLine('### Output');
    response.appendResponseLine('```');
    response.appendResponseLine(cleaned || '(no output yet)');
    response.appendResponseLine('```');

    if (data.inputHistory.length > 0) {
      response.appendResponseLine('');
      response.appendResponseLine('### Command History');
      const recentCommands = data.inputHistory.slice(-10);
      for (const cmd of recentCommands) {
        response.appendResponseLine(`- \`${cmd}\``);
      }
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// send_to_tracked_terminal
// ─────────────────────────────────────────────────────────────────────────────

export const sendToTrackedTerminal = defineTool({
  name: 'send_to_tracked_terminal',
  description: `Send text or commands to a tracked terminal.

The text is typed into the terminal as if the user typed it.
Set addNewline to true (default) to press Enter and execute the command.

Use get_terminal_buffer afterward to read the command output.`,
  timeoutMs: 5000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  schema: {
    response_format: responseFormatSchema,
    terminalId: zod
      .string()
      .describe('The terminal ID from create_tracked_terminal.'),
    text: zod
      .string()
      .describe('Text to send to the terminal (command, keystrokes, etc).'),
    addNewline: zod
      .boolean()
      .optional()
      .describe('Add newline to execute immediately. Default: true.'),
  },
  handler: async (request, response) => {
    const bridgePath = ensureBridge();
    const {terminalId, text, addNewline} = request.params;

    await bridgeExec(
      bridgePath,
      `${BRIDGE_CHECK}
      const bridge = globalThis.__trackedTerminalBridge;
      return bridge.sendText(
        payload.terminalId,
        payload.text,
        payload.addNewline ?? true,
      );`,
      {terminalId, text, addNewline},
      10_000,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(
        JSON.stringify({success: true, terminalId, text}, null, 2),
      );
      return;
    }

    response.appendResponseLine(`✅ Sent to terminal \`${terminalId}\`:`);
    response.appendResponseLine('```');
    response.appendResponseLine(text);
    response.appendResponseLine('```');
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// close_tracked_terminal
// ─────────────────────────────────────────────────────────────────────────────

export const closeTrackedTerminal = defineTool({
  name: 'close_tracked_terminal',
  description: `Close a tracked terminal and clean up its buffer.

This disposes the terminal, stops the shell process, and removes
the output buffer from memory.`,
  timeoutMs: 5000,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  schema: {
    response_format: responseFormatSchema,
    terminalId: zod
      .string()
      .describe('The terminal ID to close.'),
  },
  handler: async (request, response) => {
    const bridgePath = ensureBridge();
    const {terminalId} = request.params;

    await bridgeExec(
      bridgePath,
      `${BRIDGE_CHECK}
      const bridge = globalThis.__trackedTerminalBridge;
      return bridge.closeTerminal(payload.terminalId);`,
      {terminalId},
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(
        JSON.stringify({success: true, terminalId, closed: true}, null, 2),
      );
      return;
    }

    response.appendResponseLine(`✅ Terminal \`${terminalId}\` closed and buffer cleared.`);
  },
});
