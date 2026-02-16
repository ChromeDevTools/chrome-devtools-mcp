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
  private _cdpPort: number | undefined;
  private connectInProgress: Promise<void> | undefined;
  private reconnectInProgress: Promise<void> | undefined;
  private recoveryInProgress: Promise<void> | undefined;
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
   *
   * After the fast-path, verifies the CDP connection is actually healthy
   * by sending a lightweight probe. If the probe fails, triggers a full
   * recovery (kill + relaunch the Client window).
   */
  async ensureConnection(): Promise<void> {
    if (cdpService.isConnected) {
      // Fast path — but verify CDP is actually responsive
      const healthy = await this.isCdpHealthy();
      if (healthy) {
        logger('[Lifecycle] Fast path — CDP already connected and healthy');
        return;
      }
      // CDP WebSocket is "open" but command failed — broken connection.
      // Route through recoveryInProgress mutex to prevent concurrent
      // recovery attempts when multiple tools detect the same failure.
      await this.withRecoveryDedup(() => this.recoverBrokenConnection());
      return;
    }

    if (this.reconnectInProgress) {
      logger('[Lifecycle] Reconnect in-flight — waiting');
      await this.reconnectInProgress;
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
   *
   * If the Host's `waitForClientReady` times out (Client started but CDP
   * not yet responding), falls back to `mcpReady()` which detects the
   * already-running Client and returns its CDP port.
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

    let newPort: number;
    let clientStartedAt: number | undefined;

    try {
      const result = await hotReloadRequired({
        targetWorkspace: this._targetWorkspace,
        extensionPath: this._extensionPath,
        launch: this._launchFlags,
      });
      newPort = result.cdpPort;
      clientStartedAt = result.clientStartedAt;
    } catch (hotReloadErr) {
      // Hot-reload RPC failed (likely timeout waiting for Client).
      // The Client may still be starting up. Fall back to mcpReady()
      // which checks for an existing healthy Client before spawning.
      const msg = hotReloadErr instanceof Error ? hotReloadErr.message : String(hotReloadErr);
      logger(`[Lifecycle] Hot-reload RPC failed: ${msg} — retrying via mcpReady()…`);

      const fallbackResult = await mcpReady({
        targetWorkspace: this._targetWorkspace,
        extensionPath: this._extensionPath,
        launch: this._launchFlags,
      });
      newPort = fallbackResult.cdpPort;
      clientStartedAt = fallbackResult.clientStartedAt;
      logger('[Lifecycle] Fallback mcpReady() succeeded');
    }

    this._cdpPort = newPort;
    logger(`[Lifecycle] Host rebuilt Client — new CDP port: ${newPort}`);

    await cdpService.connect(newPort);
    await initCdpEventSubscriptions();

    // Use the Client's actual start time (not Date.now()) so the mtime
    // comparison in hasExtensionChangedSince is accurate even if the Host
    // took a long time to build + spawn.
    this._debugWindowStartedAt = clientStartedAt ?? Date.now();
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
    cdpService.setDisconnectHandler((intentional, lastPort) => {
      if (intentional) {
        return;
      }

      const portToCheck = lastPort ?? this._cdpPort;
      if (!portToCheck) {
        logger('[Lifecycle] CDP closed unexpectedly with no known port — exiting');
        clearCdpEventData();
        this._debugWindowStartedAt = undefined;
        this._userDataDir = undefined;
        handleShutdown('CDP unexpected close (no port)');
        return;
      }

      this.reconnectInProgress = this.handleUnexpectedDisconnect(portToCheck)
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger(`[Lifecycle] Reconnect after disconnect failed: ${msg}`);
          clearCdpEventData();
          this._debugWindowStartedAt = undefined;
          this._userDataDir = undefined;
          handleShutdown('CDP reconnect failed');
        })
        .finally(() => {
          this.reconnectInProgress = undefined;
        });
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

  /** CDP connection generation — increments on each connect/reconnect. */
  get cdpGeneration(): number {
    return cdpService.generation;
  }

  // ── Private ────────────────────────────────────────────

  private async doConnect(options?: { forceRestart?: boolean }): Promise<void> {
    logger('[Lifecycle] Connecting — calling mcpReady()…');

    if (!this._targetWorkspace || !this._extensionPath) {
      throw new Error('[Lifecycle] Not initialized — call init() before ensureConnection()');
    }

    const result = await mcpReady({
      targetWorkspace: this._targetWorkspace,
      extensionPath: this._extensionPath,
      launch: this._launchFlags,
      forceRestart: options?.forceRestart,
    });
    const cdpPort = result.cdpPort;
    this._cdpPort = cdpPort;

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

  private async handleUnexpectedDisconnect(port: number): Promise<void> {
    logger(`[Lifecycle] CDP closed unexpectedly — probing port ${port} for reload vs close`);

    const cdpStillAlive = await this.isCdpHttpAlive(port, 4_000);
    if (!cdpStillAlive) {
      throw new Error('CDP HTTP endpoint is down; debug window appears closed');
    }

    logger('[Lifecycle] CDP endpoint still alive — treating as window reload, reconnecting...');
    clearCdpEventData();

    await cdpService.reconnect(port, 60_000);
    await initCdpEventSubscriptions();

    this._debugWindowStartedAt = Date.now();
    logger(
      `[Lifecycle] Reconnect complete — CDP restored, sessionTs=${new Date(this._debugWindowStartedAt).toISOString()}`,
    );
  }

  /**
   * Lightweight CDP health probe: send a fast command to verify the
   * WebSocket connection is actually functional (not just "open").
   */
  private async isCdpHealthy(): Promise<boolean> {
    try {
      await cdpService.sendCdp('Runtime.evaluate', {
        expression: '1',
        returnByValue: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deduplication guard for all recovery paths.
   *
   * When multiple parallel tool calls detect an unhealthy Client/CDP
   * simultaneously, only the FIRST caller drives the recovery; subsequent
   * callers await the in-flight recovery instead of starting independent
   * attempts (which would cascade restarts).
   */
  private async withRecoveryDedup(fn: () => Promise<void>): Promise<void> {
    if (this.recoveryInProgress) {
      logger('[Lifecycle] Recovery already in-flight — waiting for existing attempt…');
      await this.recoveryInProgress;
      return;
    }

    this.recoveryInProgress = fn();
    try {
      await this.recoveryInProgress;
    } finally {
      this.recoveryInProgress = undefined;
    }
  }

  /**
   * Handle a broken CDP connection (WebSocket says open but commands fail).
   * Disconnects the stale CDP, then does a full recovery via handleHotReload()
   * which kills the broken Client → rebuilds → spawns a fresh Client → reconnects.
   */
  private async recoverBrokenConnection(): Promise<void> {
    logger('[Lifecycle] Recovering broken CDP connection…');

    if (!this._targetWorkspace || !this._extensionPath) {
      throw new Error('[Lifecycle] Not initialized — call init() before recovery');
    }

    // Force-disconnect the stale WebSocket
    cdpService.disconnect();
    clearCdpEventData();
    this._debugWindowStartedAt = undefined;

    // Try a lightweight reconnect first: maybe CDP port is still alive
    // (e.g., window reloaded but didn't close)
    if (this._cdpPort) {
      const portAlive = await this.isCdpHttpAlive(this._cdpPort, 3_000);
      if (portAlive) {
        logger(`[Lifecycle] CDP HTTP alive on port ${this._cdpPort} — attempting reconnect`);
        try {
          await cdpService.connect(this._cdpPort);
          await initCdpEventSubscriptions();
          this._debugWindowStartedAt = Date.now();
          logger('[Lifecycle] Recovery via reconnect succeeded');
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger(`[Lifecycle] Reconnect failed: ${msg} — falling back to full relaunch`);
        }
      }
    }

    // Full relaunch: tell Host to kill + rebuild + spawn a new Client
    try {
      await this.handleHotReload();
      logger('[Lifecycle] Recovery via hot-reload succeeded');
    } catch (hotReloadErr) {
      const msg = hotReloadErr instanceof Error ? hotReloadErr.message : String(hotReloadErr);
      logger(`[Lifecycle] Hot-reload recovery failed: ${msg} — trying mcpReady() from scratch`);

      // Last resort: fresh mcpReady() — launches or finds an existing Client
      await this.doConnect();
      logger('[Lifecycle] Recovery via fresh doConnect() succeeded');
    }
  }

  /**
   * Recover the Client pipe connection.
   *
   * Called when a tool detects the Client pipe is unreachable.
   * Uses the shared recovery mutex to prevent concurrent recovery
   * attempts from multiple parallel tool calls.
   */
  async recoverClientConnection(): Promise<void> {
    await this.withRecoveryDedup(() => this.doRecoverClientConnection());
  }

  /**
   * Internal: performs the actual Client pipe recovery.
   * Forces CDP disconnect (the Client is likely dead), then asks the
   * Host to spawn/reconnect the Client via the standard startup flow.
   */
  private async doRecoverClientConnection(): Promise<void> {
    logger('[Lifecycle] Client pipe recovery requested — restarting Client…');

    if (!this._targetWorkspace || !this._extensionPath) {
      throw new Error('[Lifecycle] Not initialized — call init() before recoverClientConnection()');
    }

    // Client pipe is dead → CDP is almost certainly broken too
    cdpService.disconnect();
    clearCdpEventData();
    this._debugWindowStartedAt = undefined;

    // Ask Host to force-restart the Client window
    try {
      await this.doConnect({ forceRestart: true });
      logger('[Lifecycle] Client recovery via doConnect() succeeded');
    } catch (connectErr) {
      const msg = connectErr instanceof Error ? connectErr.message : String(connectErr);
      logger(`[Lifecycle] doConnect() failed: ${msg} — trying handleHotReload()`);
      await this.handleHotReload();
      logger('[Lifecycle] Client recovery via handleHotReload() succeeded');
    }
  }

  private async isCdpHttpAlive(port: number, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return response.ok;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }
}

// ── Singleton Export ──────────────────────────────────────

export const lifecycleService = new LifecycleService();
