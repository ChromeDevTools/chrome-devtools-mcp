import type {RelayServer} from '../extension/relay-server.js';

export interface CdpEvent {
  method: string;
  params: any;
  sessionId?: string;
}

export class CdpClient {
  private relay: RelayServer;
  private sessionId?: string;
  private eventHandlers = new Map<string, Map<(params: any) => void, (event: CdpEvent) => void>>();

  constructor(relay: RelayServer, sessionId?: string) {
    this.relay = relay;
    this.sessionId = sessionId;
  }

  async send(method: string, params?: any) {
    return this.relay.sendRequest('forwardCDPCommand', {
      sessionId: this.sessionId,
      method,
      params: params ?? {},
    });
  }

  /**
   * Subscribe to a specific CDP event method (e.g. 'Network.webSocketFrameReceived').
   * Filters RelayServer 'cdp-event' emissions by method name.
   */
  on(eventMethod: string, callback: (params: any) => void): void {
    const handler = (event: CdpEvent) => {
      if (event.method === eventMethod) callback(event.params);
    };
    if (!this.eventHandlers.has(eventMethod)) {
      this.eventHandlers.set(eventMethod, new Map());
    }
    this.eventHandlers.get(eventMethod)!.set(callback, handler);
    this.relay.on('cdp-event', handler);
  }

  /**
   * Unsubscribe from a specific CDP event method.
   */
  off(eventMethod: string, callback: (params: any) => void): void {
    const methodMap = this.eventHandlers.get(eventMethod);
    if (!methodMap) return;
    const handler = methodMap.get(callback);
    if (handler) {
      this.relay.off('cdp-event', handler);
      methodMap.delete(callback);
    }
    if (methodMap.size === 0) {
      this.eventHandlers.delete(eventMethod);
    }
  }

  /**
   * Remove all CDP event listeners registered through this client.
   */
  removeAllCdpListeners(): void {
    for (const [, methodMap] of this.eventHandlers) {
      for (const [, handler] of methodMap) {
        this.relay.off('cdp-event', handler);
      }
    }
    this.eventHandlers.clear();
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    // デバッグ: 例外がある場合はログに出力
    if (result?.exceptionDetails) {
      console.error('[CDP] evaluate exception:', JSON.stringify(result.exceptionDetails));
    }
    return result?.result?.value as T;
  }

  async waitForFunction(
    expression: string,
    timeoutMs = 30000,
    intervalMs = 250,
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const value = await this.evaluate<boolean>(expression);
        if (value) return true;
      } catch {
        // ignore and retry
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timed out waiting for function: ${expression}`);
  }
}
