/**
 * stdio-to-HTTP proxy for multi-client MCP support.
 *
 * When a Primary MCP server is already running, Secondary instances
 * start in proxy mode: they bridge stdio (for Claude Code) to the
 * Primary's Streamable HTTP endpoint.
 *
 * Uses MCP SDK transports to avoid custom JSON-RPC parsing.
 *
 * Resilience: On Primary disconnect, retries with exponential backoff
 * (1s, 2s, 4s — max 3 attempts, ~7s total) before giving up.
 */

import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {logger} from './logger.js';
import {IPC_CONFIG} from './config.js';
import {readLockInfo} from './process-lock.js';

interface HealthResponse {
  status: string;
  instanceId?: string;
}

/**
 * Check if the Primary's /health endpoint is reachable.
 * Optionally verifies instanceId matches the lock file.
 */
export async function checkPrimaryHealth(
  port: number,
  expectedInstanceId?: string,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `http://${IPC_CONFIG.host}:${port}${IPC_CONFIG.healthPath}`,
      {signal: AbortSignal.timeout(2000)},
    );
    if (!resp.ok) return false;

    if (expectedInstanceId) {
      const body = (await resp.json()) as HealthResponse;
      if (body.instanceId && body.instanceId !== expectedInstanceId) {
        logger(`[proxy] instanceId mismatch: expected=${expectedInstanceId.slice(0, 8)}, got=${body.instanceId.slice(0, 8)}`);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

interface RecoveryResult {
  recovered: boolean;
  port: number;
}

/**
 * Attempt to reconnect to the Primary with exponential backoff.
 * Re-reads lock file on every attempt (follow-the-leader strategy):
 * - Port may have changed (dynamic fallback)
 * - instanceId may have changed (Primary restart)
 * Returns the current port for reconnection.
 */
async function waitForPrimaryRecovery(initialPort: number): Promise<RecoveryResult> {
  for (let i = 0; i < RETRY_DELAYS.length; i++) {
    const delay = RETRY_DELAYS[i];
    logger(`[proxy] Retry ${i + 1}/${RETRY_DELAYS.length} in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Re-read lock file each attempt (port/instanceId may have changed)
    const lockInfo = readLockInfo();
    if (!lockInfo) {
      logger('[proxy] Lock file missing or unreadable, retrying...');
      continue;
    }

    const currentPort = lockInfo.port || initialPort;
    // Follow-the-leader: use lock file's instanceId as truth
    const expectedId = lockInfo.instanceId || undefined;

    if (await checkPrimaryHealth(currentPort, expectedId)) {
      logger(`[proxy] Primary recovered (port=${currentPort})`);
      return {recovered: true, port: currentPort};
    }
  }
  return {recovered: false, port: initialPort};
}

/**
 * Start in proxy mode: bridge stdio <-> Primary HTTP.
 *
 * This function never returns normally — the process exits
 * when stdin closes or the Primary becomes unreachable after retries.
 */
export async function startProxyMode(port: number): Promise<never> {
  let currentPort = port;
  const mcpUrl = new URL(
    `http://${IPC_CONFIG.host}:${currentPort}${IPC_CONFIG.mcpPath}`,
  );

  logger(`[proxy] Entering proxy mode -> ${mcpUrl}`);

  const stdio = new StdioServerTransport();
  let http = new StreamableHTTPClientTransport(mcpUrl);
  let isReconnecting = false;

  /**
   * Try to reconnect to the Primary after disconnect.
   * Follows the leader: adopts new port/instanceId from lock file.
   * On success, creates a new HTTP transport and re-wires the bridge.
   * On failure, exits with code 1.
   */
  async function handlePrimaryDisconnect(): Promise<void> {
    if (isReconnecting) return;
    isReconnecting = true;

    logger('[proxy] Primary disconnected. Attempting recovery...');

    const result = await waitForPrimaryRecovery(currentPort);
    if (!result.recovered) {
      logger('[proxy] Primary not recovered after retries. Exiting.');
      process.exit(1);
    }

    // Port may have changed after Primary restart
    currentPort = result.port;
    const newMcpUrl = new URL(
      `http://${IPC_CONFIG.host}:${currentPort}${IPC_CONFIG.mcpPath}`,
    );

    // Create new transport and re-wire
    try {
      const newHttp = new StreamableHTTPClientTransport(newMcpUrl);
      wireHttpTransport(newHttp);
      await newHttp.start();
      http = newHttp;
      isReconnecting = false;
      logger(`[proxy] Reconnected to Primary (port=${currentPort})`);
    } catch (err) {
      logger(`[proxy] Reconnection failed: ${err}`);
      process.exit(1);
    }
  }

  /**
   * Wire event handlers for an HTTP transport instance.
   */
  function wireHttpTransport(transport: StreamableHTTPClientTransport): void {
    transport.onmessage = (message) => {
      stdio.send(message).catch((err) => {
        logger(`[proxy] Failed to write to stdout: ${err}`);
      });
    };

    transport.onclose = () => {
      logger('[proxy] HTTP connection to Primary closed');
      handlePrimaryDisconnect();
    };

    transport.onerror = (err) => {
      logger(`[proxy] HTTP error: ${err.message}`);
    };
  }

  // Bridge: stdin (Claude Code) -> HTTP POST (Primary)
  stdio.onmessage = (message) => {
    http.send(message).catch((err) => {
      logger(`[proxy] Failed to forward to Primary: ${err}`);
      handlePrimaryDisconnect();
    });
  };

  // Handle stdio close (Claude Code disconnected)
  stdio.onclose = () => {
    logger('[proxy] stdio closed');
    http
      .terminateSession()
      .catch(() => {})
      .finally(() => http.close().catch(() => {}))
      .finally(() => process.exit(0));
  };

  // Wire initial HTTP transport
  wireHttpTransport(http);

  // Start HTTP transport first (sets up AbortController),
  // then stdio (starts reading from stdin).
  await http.start();
  await stdio.start();

  logger('[proxy] Proxy mode active');

  // Keep process alive; exit is handled by event handlers above.
  return new Promise<never>(() => {});
}
