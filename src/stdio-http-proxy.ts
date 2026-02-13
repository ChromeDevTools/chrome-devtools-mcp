/**
 * stdio-to-HTTP proxy for multi-client MCP support.
 *
 * When a Primary MCP server is already running, Secondary instances
 * start in proxy mode: they bridge stdio (for Claude Code) to the
 * Primary's Streamable HTTP endpoint.
 *
 * Uses MCP SDK transports to avoid custom JSON-RPC parsing.
 */

import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {logger} from './logger.js';
import {IPC_CONFIG} from './config.js';

/**
 * Check if the Primary's /health endpoint is reachable.
 */
export async function checkPrimaryHealth(port: number): Promise<boolean> {
  try {
    const resp = await fetch(
      `http://${IPC_CONFIG.host}:${port}${IPC_CONFIG.healthPath}`,
      {signal: AbortSignal.timeout(2000)},
    );
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Start in proxy mode: bridge stdio ↔ Primary HTTP.
 *
 * This function never returns normally — the process exits
 * when stdin closes or the Primary becomes unreachable.
 */
export async function startProxyMode(port: number): Promise<never> {
  const mcpUrl = new URL(
    `http://${IPC_CONFIG.host}:${port}${IPC_CONFIG.mcpPath}`,
  );

  logger(`[proxy] Entering proxy mode -> ${mcpUrl}`);

  const stdio = new StdioServerTransport();
  const http = new StreamableHTTPClientTransport(mcpUrl);

  // Bridge: stdin (Claude Code) -> HTTP POST (Primary)
  stdio.onmessage = (message) => {
    http.send(message).catch((err) => {
      logger(`[proxy] Failed to forward to Primary: ${err}`);
      process.exit(1);
    });
  };

  // Bridge: HTTP response (Primary) -> stdout (Claude Code)
  http.onmessage = (message) => {
    stdio.send(message).catch((err) => {
      logger(`[proxy] Failed to write to stdout: ${err}`);
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

  // Handle Primary disconnect
  http.onclose = () => {
    logger('[proxy] HTTP connection to Primary closed');
    process.exit(1);
  };

  http.onerror = (err) => {
    logger(`[proxy] HTTP error: ${err.message}`);
  };

  // Start HTTP transport first (sets up AbortController),
  // then stdio (starts reading from stdin).
  await http.start();
  await stdio.start();

  logger('[proxy] Proxy mode active');

  // Keep process alive; exit is handled by event handlers above.
  return new Promise<never>(() => {});
}
