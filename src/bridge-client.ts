/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

import {logger} from './logger.js';

export interface AttachDebuggerResult {
  attached: boolean;
  port: number;
  name: string;
  skipped?: boolean;
}

const BRIDGE_TIMEOUT_MS = 4_000;
const ATTACH_TIMEOUT_MS = 15_000;
const IS_WINDOWS = process.platform === 'win32';

// ── JSON-RPC 2.0 Response ──────────────────────────────

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {code: number; message: string; data?: unknown};
}

/**
 * Compute the deterministic bridge socket path for a given workspace.
 * This uses the same algorithm as extension/bridge.js, so external scripts
 * can connect directly without needing to read a marker file.
 *
 * Windows: \\.\pipe\vscode-devtools-bridge-<8-char-hash-of-lowercase-path>
 * Unix: <workspacePath>/.vscode/vscode-devtools-bridge.sock
 */
export function computeBridgePath(workspacePath: string): string {
  if (IS_WINDOWS) {
    const resolved = path.resolve(workspacePath);
    const hash = crypto
      .createHash('sha256')
      .update(resolved.toLowerCase())
      .digest('hex')
      .slice(0, 8);
    return `\\\\.\\pipe\\vscode-devtools-bridge-${hash}`;
  }
  return path.join(workspacePath, '.vscode', 'vscode-devtools-bridge.sock');
}

/**
 * @deprecated Use computeBridgePath instead. This function is kept for backward compatibility.
 */
export function discoverBridgePath(workspaceFolder: string): string {
  logger(
    'discoverBridgePath is deprecated; use computeBridgePath(workspacePath) instead',
  );
  return computeBridgePath(workspaceFolder);
}

// ── Shared JSON-RPC 2.0 Transport ──────────────────────

/**
 * Send a JSON-RPC 2.0 request over a named pipe and wait for the response.
 * Creates a new connection, sends the request, reads one response line,
 * and disconnects.
 */
function sendBridgeRequest(
  bridgePath: string,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    logger(`[bridge] ${method} → ${bridgePath} (timeout=${timeoutMs}ms)`);
    const client = net.createConnection(bridgePath);
    const reqId = `${method}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let response = '';
    let settled = false;
    client.setEncoding('utf8');

    const settle = (fn: typeof resolve | typeof reject, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { client.destroy(); } catch { /* best-effort */ }
      fn(value);
    };

    client.on('connect', () => {
      logger(`[bridge] ${method} connected — sending request (id=${reqId})`);
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
          const parsed = JSON.parse(response.slice(0, nlIdx)) as JsonRpcResponse;
          if (parsed.error) {
            logger(`[bridge] ${method} ✗ error response: [${parsed.error.code}] ${parsed.error.message}`);
            settle(
              reject,
              new Error(
                `Bridge ${method} failed [${parsed.error.code}]: ${parsed.error.message}`,
              ),
            );
          } else {
            logger(`[bridge] ${method} ✓ success`);
            settle(resolve, parsed.result);
          }
        } catch (e) {
          settle(
            reject,
            new Error(
              `Failed to parse bridge response: ${(e as Error).message}`,
            ),
          );
        }
      }
    });

    client.on('error', (err: Error) => {
      logger(`[bridge] ${method} ✗ connection error: ${err.message}`);
      settle(reject, new Error(`Bridge connection error: ${err.message}`));
    });

    client.on('close', () => {
      // If the socket closed before we got a response, reject immediately
      // instead of dangling forever.
      settle(
        reject,
        new Error(
          `Bridge ${method} socket closed before response was received`,
        ),
      );
    });

    const timeout = setTimeout(() => {
      logger(`[bridge] ${method} ✗ TIMEOUT after ${timeoutMs}ms`);
      settle(
        reject,
        new Error(`Bridge ${method} request timed out (${timeoutMs}ms)`),
      );
    }, timeoutMs);
  });
}

// ── Public Bridge Methods ───────────────────────────────

/**
 * Send an 'exec' command to the vscode-devtools bridge and wait for response.
 * The code runs in a `new Function('vscode', 'payload', ...)` context.
 * `require()` is NOT available — only `vscode` API and `payload`.
 */
export function bridgeExec(
  bridgePath: string,
  code: string,
  payload?: unknown,
  timeoutMs: number = BRIDGE_TIMEOUT_MS,
): Promise<unknown> {
  return sendBridgeRequest(bridgePath, 'exec', {code, payload}, timeoutMs);
}

/**
 * Tell the Host bridge to programmatically attach the VS Code debugger.
 * Lights up the full debug UI: orange status bar, floating toolbar, call stack.
 */
export async function bridgeAttachDebugger(
  bridgePath: string,
  port: number,
  name = `Extension Host (port ${port})`,
): Promise<AttachDebuggerResult> {
  const result = await sendBridgeRequest(
    bridgePath,
    'attach-debugger',
    {port, type: 'node', name},
    ATTACH_TIMEOUT_MS,
  );
  return result as AttachDebuggerResult;
}

/**
 * Register a child process PID with the host bridge for lifecycle management.
 * When the host VS Code shuts down, the bridge kills all registered PIDs.
 */
export async function bridgeRegisterChildPid(
  bridgePath: string,
  pid: number,
): Promise<void> {
  await sendBridgeRequest(bridgePath, 'register-child-pid', {pid}, BRIDGE_TIMEOUT_MS);
}

/**
 * Unregister a child PID from the host bridge, e.g. when the MCP server
 * intentionally tears down the debug window itself.
 */
export async function bridgeUnregisterChildPid(
  bridgePath: string,
  pid: number,
): Promise<void> {
  await sendBridgeRequest(bridgePath, 'unregister-child-pid', {pid}, BRIDGE_TIMEOUT_MS);
}

/**
 * Set the hot-reload flag on the host bridge.
 * While active, the extension's debug session terminate handler
 * will not stop the MCP server (preventing a race during extension rebuilds).
 */
export async function bridgeSetHotReload(
  bridgePath: string,
  active: boolean,
): Promise<void> {
  await sendBridgeRequest(bridgePath, 'set-hot-reload', {active}, BRIDGE_TIMEOUT_MS);
}