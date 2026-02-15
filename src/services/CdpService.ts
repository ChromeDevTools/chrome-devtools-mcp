/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CDP (Chrome DevTools Protocol) Service
 *
 * Manages the WebSocket connection to the VS Code debug window's CDP endpoint.
 * Provides:
 * - Raw CDP command sending (`sendCdp`)
 * - WebSocket lifecycle (connect, disconnect, reconnect)
 * - OOPIF target management (auto-attach, attached target tracking)
 *
 * Singleton — one CDP connection per MCP server process.
 */

import WebSocket from 'ws';
import {logger} from '../logger.js';

// ── Types ────────────────────────────────────────────────

interface CdpTarget {
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  id: string;
}

interface CdpVersionInfo {
  Browser: string;
  webSocketDebuggerUrl?: string;
  [key: string]: unknown;
}

export interface AttachedTargetInfo {
  sessionId: string;
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
}

export interface CdpTargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
  canAccessOpener: boolean;
  browserContextId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CdpResult = Record<string, any>;

export interface SendCdpOptions {
  sessionId?: string;
  ws?: WebSocket;
}

// ── Disconnect Handler Type ──────────────────────────────

type DisconnectHandler = (intentional: boolean, lastPort?: number) => void;

// ── Service Implementation ───────────────────────────────

class CdpService {
  private ws: WebSocket | undefined;
  private port: number | undefined;
  private messageId = 0;
  private generationCounter = 0;
  private intentionalClose = false;
  private reconnectInProgress: Promise<void> | undefined;
  private readonly attachedTargets = new Map<string, AttachedTargetInfo>();
  private onDisconnect: DisconnectHandler | undefined;

  // ── CDP Communication ──────────────────────────────────

  /**
   * Send a CDP command and await the matching response.
   * Supports OOPIF targets via sessionId in options.
   */
  sendCdp(
    method: string,
    params: Record<string, unknown> = {},
    optionsOrWs?: SendCdpOptions | WebSocket,
  ): Promise<CdpResult> {
    let sessionId: string | undefined;
    let socket: WebSocket | undefined;

    if (optionsOrWs instanceof WebSocket) {
      socket = optionsOrWs;
    } else if (optionsOrWs) {
      sessionId = optionsOrWs.sessionId;
      socket = optionsOrWs.ws;
    }

    socket = socket ?? this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP WebSocket is not connected'));
    }

    const targetSocket = socket;
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const handler = (evt: WebSocket.MessageEvent) => {
        const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (data.id === id) {
          targetSocket.removeEventListener('message', handler);
          if (data.error) {
            const errorObj = data.error as {message: string};
            reject(new Error(`CDP ${method}: ${errorObj.message}`));
          } else {
            resolve(data.result as CdpResult);
          }
        }
      };
      targetSocket.addEventListener('message', handler);

      const message: Record<string, unknown> = {id, method, params};
      if (sessionId) {
        message.sessionId = sessionId;
      }
      targetSocket.send(JSON.stringify(message));
    });
  }

  // ── Connection Management ──────────────────────────────

  /**
   * Connect to a CDP endpoint on the given port.
   * Finds the workbench page target and opens a WebSocket.
   * Enables Runtime + Page domains and sets up OOPIF auto-attach.
   */
  async connect(cdpPort: number): Promise<void> {
    this.generationCounter++;
    logger(`[CdpService] Connecting to CDP port ${cdpPort} (gen=${this.generationCounter})`);

    const versionInfo = await this.waitForDebugPort(cdpPort);
    logger(`[CdpService] CDP available: ${versionInfo.Browser}`);

    const workbench = await this.findWorkbenchTarget(cdpPort);
    logger(`[CdpService] Target: "${workbench.title}"`);

    this.ws = await this.connectWebSocket(workbench.webSocketDebuggerUrl);
    this.port = cdpPort;

    await this.sendCdp('Runtime.enable', {}, this.ws);
    await this.sendCdp('Page.enable', {}, this.ws);
    this.setupTargetEventListeners(this.ws);
    await this.enableAutoAttach();

    this.ws.on('close', () => this.handleClose());

    logger(`[CdpService] Connected (gen=${this.generationCounter})`);
  }

  async reconnect(cdpPort: number, timeout = 60_000): Promise<void> {
    if (this.reconnectInProgress) {
      return this.reconnectInProgress;
    }

    this.reconnectInProgress = (async () => {
      this.intentionalClose = false;
      this.clearAttachedTargets();
      this.ws = undefined;
      this.port = cdpPort;

      const started = Date.now();
      let lastError: unknown;

      while (Date.now() - started < timeout) {
        try {
          await this.waitForDebugPort(cdpPort, 2_000);
          const workbench = await this.findWorkbenchTarget(cdpPort);

          const ws = await this.connectWebSocket(workbench.webSocketDebuggerUrl);
          this.ws = ws;
          this.port = cdpPort;

          await this.sendCdp('Runtime.enable', {}, ws);
          await this.sendCdp('Page.enable', {}, ws);
          this.setupTargetEventListeners(ws);
          await this.enableAutoAttach();
          ws.on('close', () => this.handleClose());

          this.generationCounter++;
          logger(`[CdpService] Reconnected to CDP port ${cdpPort} (gen=${this.generationCounter})`);
          return;
        } catch (err) {
          lastError = err;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const detail = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`Failed to reconnect CDP within ${timeout}ms: ${detail}`);
    })().finally(() => {
      this.reconnectInProgress = undefined;
    });

    return this.reconnectInProgress;
  }

  /**
   * Disconnect the CDP WebSocket intentionally (e.g., for hot-reload or shutdown).
   * Does NOT trigger the "user closed window" exit path.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearAttachedTargets();
    try {
      this.ws?.close();
    } catch {
      // best-effort
    }
    this.ws = undefined;
    this.port = undefined;
  }

  /**
   * Set a callback for when the CDP WebSocket disconnects unexpectedly.
   * LifecycleService uses this to exit the MCP server when the user
   * closes the debug window.
   */
  setDisconnectHandler(handler: DisconnectHandler): void {
    this.onDisconnect = handler;
  }

  // ── State Getters ──────────────────────────────────────

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get webSocket(): WebSocket | undefined {
    return this.ws;
  }

  get currentPort(): number | undefined {
    return this.port;
  }

  get isReconnecting(): boolean {
    return Boolean(this.reconnectInProgress);
  }

  get generation(): number {
    return this.generationCounter;
  }

  // ── OOPIF Target Management ────────────────────────────

  getAttachedTargets(): AttachedTargetInfo[] {
    return Array.from(this.attachedTargets.values());
  }

  getAttachedTarget(sessionId: string): AttachedTargetInfo | undefined {
    return this.attachedTargets.get(sessionId);
  }

  async getAllTargets(): Promise<CdpTargetInfo[]> {
    const result = await this.sendCdp('Target.getTargets');
    return (result.targetInfos ?? []) as CdpTargetInfo[];
  }

  // ── Private Helpers ────────────────────────────────────

  private handleClose(): void {
    const wasIntentional = this.intentionalClose;
    const lastPort = this.port;
    this.intentionalClose = false;
    this.clearAttachedTargets();
    this.ws = undefined;
    this.port = undefined;

    if (wasIntentional) {
      logger('[CdpService] CDP closed (intentional)');
    } else {
      logger('[CdpService] CDP closed (unexpected — user closed debug window?)');
    }

    this.onDisconnect?.(wasIntentional, lastPort);
  }

  private clearAttachedTargets(): void {
    this.attachedTargets.clear();
  }

  private setupTargetEventListeners(ws: WebSocket): void {
    ws.addEventListener('message', (evt: WebSocket.MessageEvent) => {
      const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.method === 'Target.attachedToTarget') {
        const params = data.params as {
          sessionId: string;
          targetInfo: {
            targetId: string;
            type: string;
            title: string;
            url: string;
            attached: boolean;
          };
        };
        const info: AttachedTargetInfo = {
          sessionId: params.sessionId,
          targetId: params.targetInfo.targetId,
          type: params.targetInfo.type,
          title: params.targetInfo.title,
          url: params.targetInfo.url,
          attached: true,
        };
        this.attachedTargets.set(params.sessionId, info);
        logger(`[Target] Attached: ${info.type} "${info.title}" (${info.sessionId.substring(0, 8)}...)`);
      }

      if (data.method === 'Target.detachedFromTarget') {
        const params = data.params as {sessionId: string};
        const target = this.attachedTargets.get(params.sessionId);
        if (target) {
          logger(`[Target] Detached: ${target.type} "${target.title}"`);
          this.attachedTargets.delete(params.sessionId);
        }
      }
    });
  }

  private async enableAutoAttach(): Promise<void> {
    if (!this.ws) {
      throw new Error('CDP not connected');
    }
    await this.sendCdp('Target.setDiscoverTargets', {discover: true});
    await this.sendCdp('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{type: 'iframe'}, {type: 'page'}],
    });
    logger('[Target] Auto-attach enabled for OOPIF discovery');
  }

  private async waitForDebugPort(
    port: number,
    timeout = 30_000,
  ): Promise<CdpVersionInfo> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) {
          return (await r.json()) as CdpVersionInfo;
        }
      } catch {
        // Port not ready
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(
      `CDP port ${port} did not become available within ${timeout}ms.\n` +
        'Possible causes:\n' +
        '- Firewall blocking the port\n' +
        '- VS Code failed to start with debugging enabled\n' +
        '- Another process claimed the port before VS Code',
    );
  }

  private async findWorkbenchTarget(port: number): Promise<CdpTarget> {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = (await response.json()) as CdpTarget[];

    let workbench = targets.find(
      t => t.type === 'page' && t.title.includes('Visual Studio Code'),
    );
    if (!workbench) {
      workbench = targets.find(t => t.type === 'page');
      if (workbench) {
        logger(`[CdpService] No "Visual Studio Code" title, using first page: "${workbench.title}"`);
      }
    }
    if (!workbench) {
      throw new Error(
        `Could not find VS Code workbench target among ${targets.length} targets.\n` +
          `Available: ${targets.map(t => `${t.type}: ${t.title}`).join(', ')}`,
      );
    }
    return workbench;
  }

  private async connectWebSocket(wsUrl: string): Promise<WebSocket> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (err: WebSocket.ErrorEvent) =>
        reject(new Error(`CDP WebSocket error: ${err.message}`));
    });
    return ws;
  }
}

// ── Singleton Export ──────────────────────────────────────

export const cdpService = new CdpService();
