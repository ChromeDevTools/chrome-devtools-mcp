/**
 * ExtensionTransport - Puppeteer ConnectionTransport implementation
 * Routes CDP messages through RelayServer to Chrome Extension
 */

import { ConnectionTransport } from 'puppeteer-core';
import { RelayServer } from './relay-server.js';

export class ExtensionTransport implements ConnectionTransport {
  private relay: RelayServer;
  private targetInfo?: {
    targetId: string;
    type: string;
    title: string;
    url: string;
    canActivate?: boolean;
    browserContextId?: string;
  };
  private sessionByTargetId: Map<string, string>;
  private browserTargetId = 'browser';
  private browserSessionId = 'ext-browser';

  onmessage?: (message: string) => void;
  onclose?: () => void;

  constructor(
    relay: RelayServer,
    _targetInfo?: {
      targetId: string;
      type: string;
      title: string;
      url: string;
      canActivate?: boolean;
      browserContextId?: string;
    },
  ) {
    this.relay = relay;
    this.targetInfo = _targetInfo;
    this.sessionByTargetId = new Map();

    // Set up relay event handlers
    this.relay.on('cdp-result', ({ id, result }) => {
      this.handleCDPResult(id, result);
    });

    this.relay.on('cdp-error', ({ id, error }) => {
      this.handleCDPError(id, error);
    });

    this.relay.on('cdp-event', ({ method, params, sessionId }) => {
      this.handleCDPEvent(method, params, sessionId);
    });

    this.relay.on('disconnected', () => {
      this.handleDisconnect();
    });

    this.relay.on('detached', (reason) => {
      this.handleDetach(reason);
    });

    // Fast-path: immediately emit a single target to avoid waiting on discovery.
    queueMicrotask(() => {
      if (!this.targetInfo) return;
      this.emitTargetCreated();
      const info = this.getTargetInfo(undefined, true);
      if (info) {
        this.emitAttached(this.getSessionId(this.targetInfo.targetId), info);
      }
    });
  }

  /**
   * Send CDP message (Puppeteer calls this)
   */
  send(message: string): void {
    try {
      const msg = JSON.parse(message);

      if (typeof msg.method === 'string' && msg.method.startsWith('Target.')) {
        this.handleTargetCommand(msg);
        return;
      }

      this.relay.sendMessage({
        id: msg.id,
        method: 'forwardCDPCommand',
        params: {
          sessionId: msg.sessionId,
          method: msg.method,
          params: msg.params ?? {},
        },
      });

      // Store callback for later resolution
      // Note: We'll resolve this when we get the result from the extension
      // For now, Puppeteer handles the promise via its own callback mechanism

    } catch (error) {
      console.error('[ExtensionTransport] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Close transport
   */
  close(): void {
    console.log('[ExtensionTransport] Closing transport');
    this.relay.removeAllListeners();

    if (this.onclose) {
      this.onclose();
    }
  }

  /**
   * Handle CDP result from Extension
   */
  private handleCDPResult(id: number, result: any): void {
    // Forward result to Puppeteer via onmessage
    if (this.onmessage) {
      const message = JSON.stringify({
        id,
        result
      });
      this.onmessage(message);
    }
  }

  /**
   * Handle CDP error from Extension
   */
  private handleCDPError(id: number, error: string): void {
    // Forward error to Puppeteer via onmessage
    if (this.onmessage) {
      const message = JSON.stringify({
        id,
        error: {
          message: error
        }
      });
      this.onmessage(message);
    }
  }

  /**
   * Handle CDP event from Extension
   */
  private handleCDPEvent(method: string, params: any, sessionId?: string): void {
    if (method.startsWith('Target.')) {
      return;
    }
    // Forward event to Puppeteer via onmessage
    if (this.onmessage) {
      const message = JSON.stringify({
        method,
        params,
        ...(sessionId ? {sessionId} : {}),
      });
      this.onmessage(message);
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    console.log('[ExtensionTransport] Extension disconnected');
    if (this.onclose) {
      this.onclose();
    }
  }

  /**
   * Handle debugger detach
   */
  private handleDetach(reason: string): void {
    console.log(`[ExtensionTransport] Debugger detached: ${reason}`);
    if (this.onclose) {
      this.onclose();
    }
  }

  private handleTargetCommand(message: {
    id: number;
    method: string;
    params?: any;
  }): void {
    const params = message.params ?? {};
    switch (message.method) {
      case 'Target.getBrowserContexts':
        this.sendResult(message.id, { browserContextIds: ['default'] });
        return;
      case 'Target.setDiscoverTargets':
        this.emitTargetCreated();
        this.sendResult(message.id, {});
        return;
      case 'Target.getTargets':
        this.sendResult(message.id, { targetInfos: this.getTargetInfos() });
        return;
      case 'Target.getTargetInfo':
        this.sendResult(message.id, {
          targetInfo: this.getTargetInfo(params.targetId, true),
        });
        return;
      case 'Target.attachToBrowserTarget': {
        this.emitAttached(this.browserSessionId, this.getBrowserTarget());
        this.sendResult(message.id, { sessionId: this.browserSessionId });
        return;
      }
      case 'Target.attachToTarget': {
        const targetId = String(params.targetId ?? this.targetInfo?.targetId ?? '');
        const sessionId = this.getSessionId(targetId);
        this.emitAttached(sessionId, this.getTargetInfo(targetId, true));
        this.sendResult(message.id, { sessionId });
        return;
      }
      case 'Target.setAutoAttach': {
        this.emitAttached(this.browserSessionId, this.getBrowserTarget());
        const target = this.getTargetInfo(undefined, true);
        if (target) {
          this.emitAttached(this.getSessionId(target.targetId), target);
        }
        this.sendResult(message.id, {});
        return;
      }
      case 'Target.activateTarget':
      case 'Target.closeTarget':
        this.sendResult(message.id, {});
        return;
      case 'Target.detachFromTarget': {
        const targetId = String(params.targetId ?? '');
        const sessionId = this.getSessionId(targetId);
        this.emitEvent('Target.detachedFromTarget', { sessionId, targetId });
        this.sendResult(message.id, {});
        return;
      }
      default:
        this.sendResult(message.id, {});
    }
  }

  private sendResult(id: number, result: any) {
    if (!this.onmessage) return;
    this.onmessage(JSON.stringify({ id, result }));
  }

  private emitEvent(method: string, params: any) {
    if (!this.onmessage) return;
    this.onmessage(JSON.stringify({ method, params }));
  }

  private emitTargetCreated() {
    this.emitEvent('Target.targetCreated', {
      targetInfo: this.getBrowserTarget(),
    });
    const target = this.getTargetInfo(undefined, false);
    if (target) {
      this.emitEvent('Target.targetCreated', { targetInfo: target });
    }
  }

  private emitAttached(sessionId: string, targetInfo: any) {
    this.emitEvent('Target.attachedToTarget', {
      sessionId,
      targetInfo,
      waitingForDebugger: false,
    });
  }

  private getBrowserTarget() {
    return {
      targetId: this.browserTargetId,
      type: 'browser',
      title: 'Chrome',
      url: '',
      attached: true,
      canActivate: false,
      browserContextId: 'default',
    };
  }

  private getTargetInfo(targetId?: string, attached: boolean = false) {
    if (targetId === this.browserTargetId) {
      return this.getBrowserTarget();
    }
    if (!this.targetInfo) {
      return undefined;
    }
    if (targetId && targetId !== this.targetInfo.targetId) {
      return undefined;
    }
    return {
      ...this.targetInfo,
      attached,
      canActivate: true,
      browserContextId: this.targetInfo.browserContextId ?? 'default',
    };
  }

  private getTargetInfos() {
    const targets = [this.getBrowserTarget()];
    const target = this.getTargetInfo(undefined, false);
    if (target) {
      targets.push(target);
    }
    return targets;
  }

  private getSessionId(targetId?: string) {
    if (!targetId || targetId === this.browserTargetId) {
      return this.browserSessionId;
    }
    if (!this.sessionByTargetId.has(targetId)) {
      this.sessionByTargetId.set(targetId, `ext-${targetId}`);
    }
    return this.sessionByTargetId.get(targetId) ?? `ext-${targetId}`;
  }
}
