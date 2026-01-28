/**
 * ExtensionTransport - Puppeteer ConnectionTransport implementation
 * Routes CDP messages through RelayServer to Chrome Extension
 */

import { ConnectionTransport } from 'puppeteer-core';
import { RelayServer } from './relay-server.js';

export class ExtensionTransport implements ConnectionTransport {
  private relay: RelayServer;
  private pendingCallbacks: Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>;
  private nextId: number = 0;

  onmessage?: (message: string) => void;
  onclose?: () => void;

  constructor(relay: RelayServer) {
    this.relay = relay;
    this.pendingCallbacks = new Map();

    // Set up relay event handlers
    this.relay.on('cdp-result', ({ id, result }) => {
      this.handleCDPResult(id, result);
    });

    this.relay.on('cdp-error', ({ id, error }) => {
      this.handleCDPError(id, error);
    });

    this.relay.on('cdp-event', ({ method, params }) => {
      this.handleCDPEvent(method, params);
    });

    this.relay.on('disconnected', () => {
      this.handleDisconnect();
    });

    this.relay.on('detached', (reason) => {
      this.handleDetach(reason);
    });
  }

  /**
   * Send CDP message (Puppeteer calls this)
   */
  send(message: string): void {
    try {
      const msg = JSON.parse(message);

      // Send command through relay
      this.relay.sendCDPCommand(msg.id, msg.method, msg.params);

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
  private handleCDPEvent(method: string, params: any): void {
    // Forward event to Puppeteer via onmessage
    if (this.onmessage) {
      const message = JSON.stringify({
        method,
        params
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
}
