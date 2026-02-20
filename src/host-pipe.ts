/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Host Pipe Client
 *
 * Connects to the Host extension's pipe server to manage lifecycle:
 * - mcpReady: Announce MCP presence → Host spawns/reconnects Client → returns CDP port
 * - hotReloadRequired: Extension changed → Host rebuilds + restarts Client → returns new CDP port
 * - getStatus: Query current Host/Client state
 * - teardown: MCP shutting down → Host cleans up Client + debug sessions
 * - takeover: Request session handoff from existing Host
 */

import net from 'node:net';
import {logger} from './logger.js';

// ── Constants ────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32';
const HOST_PIPE_PATH = IS_WINDOWS
  ? '\\\\.\\pipe\\vscode-devtools-host'
  : '/tmp/vscode-devtools-host.sock';

const DEFAULT_TIMEOUT_MS = 10_000;
// Spawning the Client VS Code window can take 30+ seconds (cold start)
const SPAWN_TIMEOUT_MS = 60_000;
const HOT_RELOAD_TIMEOUT_MS = 120_000;

// ── Types ────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {code: number; message: string; data?: unknown};
}

export interface McpReadyParams {
  clientWorkspace: string;
  extensionPath: string;
  launch?: Record<string, unknown>;
  forceRestart?: boolean;
}

export interface McpReadyResult {
  cdpPort: number;
  userDataDir?: string;
  clientStartedAt?: number;
}

export interface HotReloadResult {
  cdpPort: number;
  userDataDir?: string;
  clientStartedAt?: number;
}

export interface HostStatus {
  role: 'host';
  clientPid: number | null;
  cdpPort: number | null;
  clientStartedAt: string | null;
  clientHealthy: boolean;
  hotReloadInProgress: boolean;
}

export interface TeardownResult {
  stopped: boolean;
}

export interface TakeoverResult {
  accepted: boolean;
  previousClientPid?: number;
}

// ── JSON-RPC Transport ───────────────────────────────────

/**
 * Send a JSON-RPC 2.0 request to the Host pipe and await the response.
 * Each call creates a fresh connection, sends the request, reads one
 * newline-delimited response, and disconnects.
 */
function sendHostRequest(
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    logger(`[host-pipe] ${method} → ${HOST_PIPE_PATH} (timeout=${timeoutMs}ms)`);
    const client = net.createConnection(HOST_PIPE_PATH);
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
      logger(`[host-pipe] ${method} connected — sending request (id=${reqId})`);
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
            logger(
              `[host-pipe] ${method} ✗ error: [${parsed.error.code}] ${parsed.error.message}`,
            );
            settle(
              reject,
              new Error(
                `Host ${method} failed [${parsed.error.code}]: ${parsed.error.message}`,
              ),
            );
          } else {
            logger(`[host-pipe] ${method} ✓ success`);
            settle(resolve, parsed.result);
          }
        } catch (e) {
          settle(
            reject,
            new Error(
              `Failed to parse Host response: ${(e as Error).message}`,
            ),
          );
        }
      }
    });

    client.on('error', (err: Error) => {
      logger(`[host-pipe] ${method} ✗ connection error: ${err.message}`);
      settle(reject, new Error(`Host connection error: ${err.message}`));
    });

    client.on('close', () => {
      settle(
        reject,
        new Error(
          `Host ${method} socket closed before response was received`,
        ),
      );
    });

    const timer = setTimeout(() => {
      logger(`[host-pipe] ${method} ✗ TIMEOUT after ${timeoutMs}ms`);
      settle(
        reject,
        new Error(`Host ${method} request timed out (${timeoutMs}ms)`),
      );
    }, timeoutMs);
  });
}

// ── Public Methods ───────────────────────────────────────

/**
 * Announce that the MCP server is ready.
 * The Host will spawn or reconnect to the Client (Extension Development Host)
 * and return the CDP port for Chrome DevTools Protocol connections.
 */
export async function mcpReady(params: McpReadyParams): Promise<McpReadyResult> {
  const result = await sendHostRequest('mcpReady', {...params}, SPAWN_TIMEOUT_MS);
  return result as McpReadyResult;
}

/**
 * Request a hot-reload: rebuild the extension and restart the Client.
 * This has a longer timeout since builds can take time.
 */
export async function hotReloadRequired(params: McpReadyParams): Promise<HotReloadResult> {
  const result = await sendHostRequest(
    'hotReloadRequired',
    {...params},
    HOT_RELOAD_TIMEOUT_MS,
  );
  return result as HotReloadResult;
}

/**
 * Query the current state of the Host and Client.
 */
async function getStatus(): Promise<HostStatus> {
  const result = await sendHostRequest('getStatus', {});
  return result as HostStatus;
}

/**
 * Signal that the MCP server is shutting down.
 * The Host will stop the Client, clean up debug sessions, and release resources.
 */
export async function teardown(): Promise<TeardownResult> {
  const result = await sendHostRequest('teardown', {});
  return result as TeardownResult;
}

/**
 * Request a session takeover from the existing Host.
 * Used when a new MCP instance wants to control the session.
 */
async function requestTakeover(): Promise<TakeoverResult> {
  const result = await sendHostRequest('takeover', {});
  return result as TakeoverResult;
}

/**
 * Ask the Host extension to check both MCP server and extension source
 * for content changes, rebuild if needed, and return the results.
 *
 * The extension is the single authority for all change detection.
 * The MCP server does ZERO hashing — it only asks and acts on the answer.
 *
 * Timeout is set high (120s) because the extension may need to:
 * 1. Discover source files (tsconfig parsing)
 * 2. Compute content hashes (SHA-256 of all source files)
 * 3. Rebuild MCP server and/or extension if changed
 * 4. Restart the Client window if extension was rebuilt
 */
export async function checkForChanges(
  mcpServerRoot: string,
  extensionPath: string,
): Promise<CheckForChangesResult> {
  const result = await sendHostRequest(
    'checkForChanges',
    {mcpServerRoot, extensionPath},
    HOT_RELOAD_TIMEOUT_MS,
  );
  return result as CheckForChangesResult;
}

export interface CheckForChangesResult {
  mcpChanged: boolean;
  mcpRebuilt: boolean;
  mcpBuildError: string | null;
  extChanged: boolean;
  extRebuilt: boolean;
  extBuildError: string | null;
  extClientReloaded: boolean;
  newCdpPort?: number;
  newClientStartedAt?: number;
}

/**
 * Signal the Host extension that the MCP server has drained its queue
 * and is ready to be killed and restarted.
 *
 * The extension will: stop MCP server → clear tool cache → start MCP server.
 * The build was already done during the checkForChanges RPC, so the
 * restart is near-instant.
 *
 * Fire-and-forget — the response may never arrive since the MCP process
 * is about to be killed.
 */
export async function readyToRestart(): Promise<void> {
  try {
    await sendHostRequest('readyToRestart', {}, 15_000);
  } catch {
    // Expected — the server may be killed before the response arrives
  }
}

/**
 * Check if the Host pipe is reachable via a system.ping.
 */
async function pingHost(): Promise<boolean> {
  try {
    await sendHostRequest('system.ping', {}, 3_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the fixed Host pipe path for this platform.
 */
function getHostPipePath(): string {
  return HOST_PIPE_PATH;
}
