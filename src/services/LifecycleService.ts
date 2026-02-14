/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP Lifecycle Service
 *
 * Orchestrates the MCP server's connection lifecycle:
 * - Startup: announce to Host → Host spawns/reconnects Client → connect CDP
 * - Hot-reload: reconnect to new CDP port after Host rebuilds Client
 * - Shutdown: clean disconnect (debug window preserved for reconnect)
 *
 * Uses Host pipe for lifecycle RPCs and CdpService for CDP connection.
 * Singleton — one lifecycle per MCP server process.
 */

import process from 'node:process';

import {cdpService} from './CdpService.js';
import {mcpReady, hotReloadRequired, teardown as hostTeardown} from '../host-pipe.js';
import {initCdpEventSubscriptions, clearAllData as clearCdpEventData} from '../cdp-events.js';
import {stopMcpSocketServer} from '../mcp-socket-server.js';
import {logger} from '../logger.js';

// ── Service Implementation ───────────────────────────────

class LifecycleService {
  private _debugWindowStartedAt: number | undefined;
  private _userDataDir: string | undefined;
  private connectInProgress: Promise<void> | undefined;
  private exitCleanupDone = false;
  private shutdownHandlersRegistered = false;

  /** Target workspace folder the Client should open */
  private _targetWorkspace: string | undefined;
  /** Extension development path for the Client */
  private _extensionPath: string | undefined;
  /** Launch flags for the Client VS Code window */
  private _launchFlags: Record<string, unknown> | undefined;
  /** True if this MCP process was just hot-reloaded */
  private _wasHotReloaded = false;

  /**
   * Initialize with config values from the MCP server.
   * Must be called before ensureConnection().
   * 
   * @param params.wasHotReloaded - True if MCP server was just hot-reloaded (from marker file in main.ts)
   */
  init(params: { targetWorkspace: string; extensionPath: string; launch?: Record<string, unknown>; wasHotReloaded?: boolean }): void {
    this._targetWorkspace = params.targetWorkspace;
    this._extensionPath = params.extensionPath;
    this._launchFlags = params.launch;
    this._wasHotReloaded = params.wasHotReloaded ?? false;
    logger(`[Lifecycle] Initialized — target=${params.targetWorkspace}, ext=${params.extensionPath}, wasHotReloaded=${this._wasHotReloaded}`);
  }

  // ── Startup ────────────────────────────────────────────

  /**
   * Ensure the VS Code debug window is running and CDP is connected.
   *
   * On first call: announces MCP to Host via `mcpReady()`, which spawns
   * or reconnects the Client, then connects CDP WebSocket.
   *
   * On subsequent calls: returns immediately if CDP is already connected.
   * If another connection attempt is in-flight, waits for it.
   */
  async ensureConnection(): Promise<void> {
    if (cdpService.isConnected) {
      logger('[Lifecycle] Fast path — CDP already connected');
      return;
    }

    if (this.connectInProgress) {
      logger('[Lifecycle] Connection in-flight — waiting');
      return this.connectInProgress;
    }

    this.connectInProgress = this.doConnect();
    try {
      await this.connectInProgress;
    } finally {
      this.connectInProgress = undefined;
    }
  }

  // ── Hot-Reload ─────────────────────────────────────────

  /**
   * Handle hot-reload: tell Host to rebuild Client, then reconnect CDP.
   *
   * Host internally: stops Client → builds → spawns new Client → returns new CDP port.
   * MCP: disconnects old CDP → connects to new CDP port → re-inits event subscriptions.
   */
  async handleHotReload(): Promise<void> {
    logger('[Lifecycle] Hot-reload — requesting Host rebuild…');

    if (!this._targetWorkspace || !this._extensionPath) {
      throw new Error('[Lifecycle] Not initialized — call init() before handleHotReload()');
    }

    // Disconnect CDP BEFORE telling the Host to rebuild.
    // Host will kill the Client (which closes the WebSocket), and if we
    // haven't marked the close as intentional beforehand, the disconnect
    // handler treats it as "user closed window" and calls process.exit().
    cdpService.disconnect();
    clearCdpEventData();

    const result = await hotReloadRequired({
      targetWorkspace: this._targetWorkspace,
      extensionPath: this._extensionPath,
      launch: this._launchFlags,
    });
    const newPort = result.cdpPort;

    logger(`[Lifecycle] Host rebuilt Client — new CDP port: ${newPort}`);

    await cdpService.connect(newPort);
    await initCdpEventSubscriptions();

    // Use the Client's actual start time (not Date.now()) so the mtime
    // comparison in hasExtensionChangedSince is accurate even if the Host
    // took a long time to build + spawn.
    this._debugWindowStartedAt = result.clientStartedAt ?? Date.now();
    logger(`[Lifecycle] Hot-reload complete — CDP reconnected, sessionTs=${new Date(this._debugWindowStartedAt).toISOString()}`);
  }

  // ── Shutdown ───────────────────────────────────────────

  /**
   * Stop the debug window (e.g., for a full teardown).
   * Tells Host to clean up Client + debug sessions, then disconnects CDP.
   */
  async stopDebugWindow(): Promise<void> {
    try {
      await hostTeardown();
    } catch {
      // best-effort — Host may already be gone
    }
    cdpService.disconnect();
    clearCdpEventData();
    this._debugWindowStartedAt = undefined;
    this._userDataDir = undefined;
    logger('[Lifecycle] Debug window stopped');
  }

  /**
   * Graceful detach: close CDP WebSocket, clear state.
   * Debug window stays alive for reconnect by a future MCP instance.
   */
  detachGracefully(): void {
    cdpService.disconnect();
    clearCdpEventData();
    this._debugWindowStartedAt = undefined;
    this._userDataDir = undefined;
    logger('[Lifecycle] Detached gracefully — debug window preserved');
  }

  /**
   * Register process-level shutdown handlers.
   * Call once during MCP server startup.
   *
   * On Windows, VS Code kills the MCP server by closing stdin.
   * All soft shutdown paths detach gracefully so the debug window
   * survives restarts.
   */
  registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) return;
    this.shutdownHandlersRegistered = true;

    const handleShutdown = (source: string): void => {
      if (this.exitCleanupDone) {
        logger(`[shutdown] ${source} — already cleaned up`);
        return;
      }
      this.exitCleanupDone = true;
      logger(`[shutdown] ${source} — detaching gracefully`);
      this.detachGracefully();
      stopMcpSocketServer();
      process.exit(0);
    };

    process.stdin.on('end', () => handleShutdown('stdin ended'));

    process.on('exit', () => {
      if (this.exitCleanupDone) return;
      this.exitCleanupDone = true;
      this.detachGracefully();
      stopMcpSocketServer();
    });

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    process.on('uncaughtException', (err) => {
      logger('Uncaught exception:', err);
      if (!this.exitCleanupDone) {
        this.exitCleanupDone = true;
        this.detachGracefully();
        stopMcpSocketServer();
      }
      process.exit(1);
    });

    // Unexpected CDP close → user closed the debug window → exit
    cdpService.setDisconnectHandler((intentional) => {
      if (!intentional) {
        logger('[Lifecycle] Debug window closed by user — exiting');
        clearCdpEventData();
        this._debugWindowStartedAt = undefined;
        this._userDataDir = undefined;
        handleShutdown('CDP unexpected close');
      }
    });
  }

  // ── State Getters ──────────────────────────────────────

  get isConnected(): boolean {
    return cdpService.isConnected;
  }

  get debugWindowStartedAt(): number | undefined {
    return this._debugWindowStartedAt;
  }

  get userDataDir(): string | undefined {
    return this._userDataDir;
  }

  // ── Private ────────────────────────────────────────────

  private async doConnect(): Promise<void> {
    logger('[Lifecycle] Connecting — calling mcpReady()…');

    if (!this._targetWorkspace || !this._extensionPath) {
      throw new Error('[Lifecycle] Not initialized — call init() before ensureConnection()');
    }

    const result = await mcpReady({
      targetWorkspace: this._targetWorkspace,
      extensionPath: this._extensionPath,
      launch: this._launchFlags,
    });
    const cdpPort = result.cdpPort;

    logger(`[Lifecycle] Host returned CDP port: ${cdpPort}`);

    await cdpService.connect(cdpPort);
    await initCdpEventSubscriptions();

    // If this MCP process was hot-reloaded (wasHotReloaded flag set in init()),
    // use the current time as the baseline for extension change detection,
    // NOT the original clientStartedAt. This prevents spurious extension
    // hot-reloads when only MCP server files changed.
    if (this._wasHotReloaded) {
      this._debugWindowStartedAt = Date.now();
      logger(`[Lifecycle] MCP hot-reload detected — using fresh timestamp for extension checks: ${new Date(this._debugWindowStartedAt).toISOString()}`);
    } else {
      // Normal startup: use the Client's actual start time so the mtime comparison
      // in hasExtensionChangedSince detects edits between Client spawn
      // and MCP (re)connection. Falls back to Date.now() for older Hosts
      // that don't include clientStartedAt.
      this._debugWindowStartedAt = result.clientStartedAt ?? Date.now();
    }

    // userDataDir comes from mcpReady response if Host provides it
    if ('userDataDir' in result && typeof result.userDataDir === 'string') {
      this._userDataDir = result.userDataDir;
    }

    logger(`[Lifecycle] Connected — CDP + events ready, sessionTs=${new Date(this._debugWindowStartedAt).toISOString()}`);
  }
}

// ── Singleton Export ──────────────────────────────────────

export const lifecycleService = new LifecycleService();
