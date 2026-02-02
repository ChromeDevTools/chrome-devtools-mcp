import type {RelayServer} from '../extension/relay-server.js';

export class CdpClient {
  private relay: RelayServer;
  private sessionId?: string;

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
