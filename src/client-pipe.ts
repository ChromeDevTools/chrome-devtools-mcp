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
 * Terminal methods:
 * - terminal.create: Create a tracked terminal
 * - terminal.sendText: Send text/commands to a terminal
 * - terminal.getBuffer: Read terminal output buffer
 * - terminal.list: List tracked terminals
 * - terminal.close: Close a tracked terminal
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
const SEND_TEXT_TIMEOUT_MS = 15_000;

// ── Types ────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {code: number; message: string; data?: unknown};
}

export interface TerminalCreateResult {
  terminalId: string;
  name: string;
}

export interface TerminalSendTextResult {
  sent: boolean;
}

export interface TerminalBufferResult {
  output: string;
  metadata?: {
    id: string;
    name: string;
    shellPath?: string;
    cwd?: string;
    createdAt: string;
    pid?: number;
    exitCode?: number;
    isRunning: boolean;
  };
  inputHistory: string[];
}

export interface TrackedTerminalMetadata {
  id: string;
  name: string;
  shellPath?: string;
  cwd?: string;
  createdAt: string;
  pid?: number;
  exitCode?: number;
  isRunning: boolean;
}

export interface AllTerminalInfo {
  index: number;
  name: string;
  processId?: number;
  creationOptions: {
    name?: string;
    shellPath?: string;
  };
  exitStatus?: {
    code: number;
    reason: number;
  };
  state: {
    isInteractedWith: boolean;
  };
  isActive: boolean;
}

export interface TerminalListAllResult {
  total: number;
  activeIndex?: number;
  terminals: AllTerminalInfo[];
}

export interface TerminalCloseResult {
  closed: boolean;
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

// ── Terminal Methods ─────────────────────────────────────

/**
 * Create a new tracked terminal in the Client window.
 */
export async function terminalCreate(options?: {
  name?: string;
  shellPath?: string;
  cwd?: string;
}): Promise<TerminalCreateResult> {
  const result = await sendClientRequest('terminal.create', {
    name: options?.name,
    shellPath: options?.shellPath,
    cwd: options?.cwd,
  });
  return result as TerminalCreateResult;
}

/**
 * Send text to a tracked terminal.
 * Uses a longer timeout since commands may take time to type.
 */
export async function terminalSendText(
  terminalId: string,
  text: string,
  addNewline?: boolean,
): Promise<TerminalSendTextResult> {
  const result = await sendClientRequest(
    'terminal.sendText',
    {terminalId, text, addNewline},
    SEND_TEXT_TIMEOUT_MS,
  );
  return result as TerminalSendTextResult;
}

/**
 * Read the output buffer of a tracked terminal.
 */
export async function terminalGetBuffer(
  terminalId: string,
  options?: {
    lastN?: number;
    includeMetadata?: boolean;
  },
): Promise<TerminalBufferResult | null> {
  const result = await sendClientRequest('terminal.getBuffer', {
    terminalId,
    lastN: options?.lastN,
    includeMetadata: options?.includeMetadata,
  });
  return result as TerminalBufferResult | null;
}

/**
 * List tracked terminals.
 */
export async function terminalList(
  runningOnly?: boolean,
): Promise<TrackedTerminalMetadata[]> {
  const result = await sendClientRequest('terminal.list', {
    runningOnly: runningOnly ?? false,
  });
  return result as TrackedTerminalMetadata[];
}

/**
 * Close a tracked terminal.
 */
export async function terminalClose(
  terminalId: string,
): Promise<TerminalCloseResult> {
  const result = await sendClientRequest('terminal.close', {terminalId});
  return result as TerminalCloseResult;
}

/**
 * List ALL terminals in the Client window (tracked and untracked).
 */
export async function terminalListAll(): Promise<TerminalListAllResult> {
  const result = await sendClientRequest('terminal.listAll', {});
  return result as TerminalListAllResult;
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
