/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client Pipe Client
 *
 * Connects to the Client extension's pipe server (Extension Development Host)
 * to interact with terminal, output channel, and VS Code command APIs.
 *
 * Terminal methods (single-terminal model):
 * - terminal.run: Run a command, wait for completion/prompt/timeout
 * - terminal.input: Send input to a waiting prompt
 * - terminal.state: Check current terminal state
 * - terminal.kill: Send Ctrl+C to stop the running process
 * - terminal.listAll: List all terminals (tracked + untracked)
 *
 * Output methods:
 * - output.listChannels: List VS Code output channels
 * - output.read: Read output channel content
 *
 * Command methods:
 * - command.execute: Execute a VS Code command
 */

import net from 'node:net';
import {logger} from './logger.js';

// ── Constants ────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32';
const CLIENT_PIPE_PATH = IS_WINDOWS
  ? '\\\\.\\pipe\\vscode-devtools-client'
  : '/tmp/vscode-devtools-client.sock';

const DEFAULT_TIMEOUT_MS = 10_000;
// Terminal operations wait up to 35s so the 30s command timeout finishes first
const TERMINAL_TIMEOUT_MS = 35_000;

// ── Types ────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {code: number; message: string; data?: unknown};
}

export type TerminalStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'waiting_for_input'
  | 'timeout';

export type WaitMode = 'completion' | 'background';

export interface ActiveProcess {
  terminalName: string;
  pid?: number;
  command: string;
  status: TerminalStatus;
  startedAt: string;
  durationMs: number;
  exitCode?: number;
}

export type ProcessStatus = 'running' | 'completed' | 'killed' | 'orphaned';

export interface ChildProcessInfo {
  pid: number;
  name: string;
  commandLine: string;
  parentPid: number;
}

export interface ProcessEntry {
  pid: number;
  command: string;
  terminalName: string;
  status: ProcessStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  sessionId: string;
  children?: ChildProcessInfo[];
}

export interface ProcessLedgerSummary {
  active: ProcessEntry[];
  orphaned: ProcessEntry[];
  recentlyCompleted: ProcessEntry[];
  terminalSessions: TerminalSessionInfo[];
  sessionId: string;
}

export interface TerminalRunResult {
  status: TerminalStatus;
  output: string;
  shell?: string;
  cwd?: string;
  exitCode?: number;
  prompt?: string;
  pid?: number;
  name?: string;
  durationMs?: number;
  activeProcesses?: ActiveProcess[];
  terminalSessions?: TerminalSessionInfo[];
}

export interface TerminalSessionInfo {
  name: string;
  shell?: string;
  pid?: number;
  isActive: boolean;
  status: string;
  command?: string;
}

export interface OutputChannelsResult {
  channels: string[];
}

export interface OutputReadResult {
  lines: string[];
  warning?: string;
}

export interface CommandExecuteResult {
  result: unknown;
}

// ── JSON-RPC Transport ───────────────────────────────────

/**
 * Send a JSON-RPC 2.0 request to the Client pipe and await the response.
 */
function sendClientRequest(
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    logger(`[client-pipe] ${method} → ${CLIENT_PIPE_PATH} (timeout=${timeoutMs}ms)`);
    const client = net.createConnection(CLIENT_PIPE_PATH);
    const reqId = `${method}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let response = '';
    let settled = false;
    client.setEncoding('utf8');

    const settle = (fn: typeof resolve | typeof reject, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        client.destroy();
      } catch {
        /* best-effort */
      }
      fn(value);
    };

    client.on('connect', () => {
      logger(`[client-pipe] ${method} connected — sending request (id=${reqId})`);
      const request =
        JSON.stringify({jsonrpc: '2.0', id: reqId, method, params}) + '\n';
      client.write(request);
    });

    client.on('data', (chunk: string) => {
      if (settled) return;
      response += chunk;
      const nlIdx = response.indexOf('\n');
      if (nlIdx !== -1) {
        try {
          const parsed = JSON.parse(
            response.slice(0, nlIdx),
          ) as JsonRpcResponse;
          if (parsed.error) {
            logger(
              `[client-pipe] ${method} ✗ error: [${parsed.error.code}] ${parsed.error.message}`,
            );
            settle(
              reject,
              new Error(
                `Client ${method} failed [${parsed.error.code}]: ${parsed.error.message}`,
              ),
            );
          } else {
            logger(`[client-pipe] ${method} ✓ success`);
            settle(resolve, parsed.result);
          }
        } catch (e) {
          settle(
            reject,
            new Error(
              `Failed to parse Client response: ${(e as Error).message}`,
            ),
          );
        }
      }
    });

    client.on('error', (err: Error) => {
      logger(`[client-pipe] ${method} ✗ connection error: ${err.message}`);
      settle(reject, new Error(`Client connection error: ${err.message}`));
    });

    client.on('close', () => {
      settle(
        reject,
        new Error(
          `Client ${method} socket closed before response was received`,
        ),
      );
    });

    const timer = setTimeout(() => {
      logger(`[client-pipe] ${method} ✗ TIMEOUT after ${timeoutMs}ms`);
      settle(
        reject,
        new Error(`Client ${method} request timed out (${timeoutMs}ms)`),
      );
    }, timeoutMs);
  });
}

// ── Terminal Methods (Multi-Terminal Model) ─────────────

/**
 * Run a command in a named terminal.
 * Creates terminal if needed, rejects with state if busy.
 * Waits for completion, prompt detection, or timeout.
 *
 * @param command The shell command to execute
 * @param shell Shell type: 'powershell', 'bash', or 'cmd'
 * @param cwd Absolute path to working directory for command execution
 * @param timeout Max wait time in milliseconds (default: 120000)
 * @param name Terminal name (default: 'default')
 * @param waitMode 'completion' blocks until done; 'background' returns immediately
 */
export async function terminalRun(
  command: string,
  shell: string,
  cwd: string,
  timeout?: number,
  name?: string,
  waitMode?: WaitMode,
): Promise<TerminalRunResult> {
  const result = await sendClientRequest(
    'terminal.run',
    {command, shell, cwd, timeout, name, waitMode},
    TERMINAL_TIMEOUT_MS,
  );
  return result as TerminalRunResult;
}

/**
 * Send input to a terminal waiting for a prompt.
 * Waits for the next completion or prompt after sending.
 *
 * @param text The text to send
 * @param addNewline Whether to press Enter after (default: true)
 * @param timeout Max wait time in milliseconds (default: 30000)
 * @param name Terminal name (default: 'default')
 */
export async function terminalInput(
  text: string,
  addNewline?: boolean,
  timeout?: number,
  name?: string,
): Promise<TerminalRunResult> {
  const result = await sendClientRequest(
    'terminal.input',
    {text, addNewline, timeout, name},
    TERMINAL_TIMEOUT_MS,
  );
  return result as TerminalRunResult;
}

/**
 * Get the current terminal state without modifying anything.
 *
 * @param name Terminal name (default: 'default')
 */
export async function terminalGetState(name?: string): Promise<TerminalRunResult> {
  const result = await sendClientRequest('terminal.state', {name});
  return result as TerminalRunResult;
}

/**
 * Send Ctrl+C to kill the running process in a terminal.
 *
 * @param name Terminal name (default: 'default')
 */
export async function terminalKill(name?: string): Promise<TerminalRunResult> {
  const result = await sendClientRequest('terminal.kill', {name});
  return result as TerminalRunResult;
}

// ── Output Methods ───────────────────────────────────────

/**
 * List available output channels.
 */
export async function outputListChannels(): Promise<OutputChannelsResult> {
  const result = await sendClientRequest('output.listChannels', {});
  return result as OutputChannelsResult;
}

/**
 * Read content from an output channel.
 */
export async function outputRead(
  channel: string,
): Promise<OutputReadResult> {
  const result = await sendClientRequest('output.read', {channel});
  return result as OutputReadResult;
}

// ── Command Methods ──────────────────────────────────────

/**
 * Execute a VS Code command in the Client window.
 */
export async function commandExecute(
  command: string,
  args?: unknown[],
): Promise<CommandExecuteResult> {
  const result = await sendClientRequest('command.execute', {command, args});
  return result as CommandExecuteResult;
}

// ── Utility ──────────────────────────────────────────────

/**
 * Check if the Client pipe is reachable via a system.ping.
 */
export async function pingClient(): Promise<boolean> {
  try {
    await sendClientRequest('system.ping', {}, 3_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the fixed Client pipe path for this platform.
 */
export function getClientPipePath(): string {
  return CLIENT_PIPE_PATH;
}

// ── Process Ledger Methods ─────────────────────────────────────

/**
 * Get the full process ledger: active, orphaned, and recently completed processes.
 * This is called before EVERY tool response for Copilot accountability.
 */
export async function getProcessLedger(): Promise<ProcessLedgerSummary> {
  try {
    const result = await sendClientRequest('system.getProcessLedger', {}, 3_000);
    return result as ProcessLedgerSummary;
  } catch {
    // Return empty ledger if unavailable
    return {
      active: [],
      orphaned: [],
      recentlyCompleted: [],
      terminalSessions: [],
      sessionId: 'unknown',
    };
  }
}
