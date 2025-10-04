/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Browser Connection Manager
 *
 * Manages Chrome DevTools Protocol (CDP) connection with automatic reconnection
 * on connection failures.
 */

import type {Browser, Page} from 'puppeteer';

/**
 * Connection manager options
 */
export interface ConnectionManagerOptions {
  maxReconnectAttempts?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  enableLogging?: boolean;
  onReconnect?: (browser: Browser) => void | Promise<void>;
}

/**
 * Default connection manager options
 */
const DEFAULT_OPTIONS = {
  maxReconnectAttempts: 3,
  initialRetryDelay: 1000, // 1 second
  maxRetryDelay: 10000, // 10 seconds
  enableLogging: true,
  onReconnect: undefined,
};

/**
 * Browser Connection Manager
 *
 * Provides automatic reconnection for CDP operations
 */
export class BrowserConnectionManager {
  private reconnectAttempts = 0;
  private options: ConnectionManagerOptions;
  private browser: Browser | null = null;
  private browserFactory: (() => Promise<Browser>) | null = null;

  constructor(options: ConnectionManagerOptions = {}) {
    this.options = {...DEFAULT_OPTIONS, ...options};
  }

  /**
   * Set browser instance and factory for reconnection
   */
  setBrowser(browser: Browser, factory: () => Promise<Browser>): void {
    this.browser = browser;
    this.browserFactory = factory;
  }

  /**
   * Execute an operation with automatic retry on CDP connection errors
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isCDPConnectionError(error)) {
        this.log(`CDP connection error in ${operationName}, attempting reconnect...`);
        return await this.retryWithReconnect(operation, operationName);
      }
      throw error;
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithReconnect<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const maxAttempts = this.options.maxReconnectAttempts ?? 3;
    const initialDelay = this.options.initialRetryDelay ?? 1000;
    const maxDelay = this.options.maxRetryDelay ?? 10000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.reconnectAttempts++;
      const attemptNum = attempt + 1;

      this.log(`Reconnect attempt ${attemptNum}/${maxAttempts} for ${operationName}...`);

      // Exponential backoff with max delay
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt),
        maxDelay,
      );

      await this.sleep(delay);

      try {
        await this.reconnectBrowser();
        this.log(`Reconnection successful, retrying ${operationName}...`);
        return await operation();
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          // Last attempt failed
          throw this.createReconnectionFailedError(attemptNum, error);
        }
        this.log(`Reconnect attempt ${attemptNum} failed: ${error}`);
      }
    }

    throw new Error('Reconnection logic error'); // Should never reach here
  }

  /**
   * Check if error is a CDP connection error
   */
  private isCDPConnectionError(error: any): boolean {
    const errorMessage = error?.message || '';
    return (
      errorMessage.includes('Target closed') ||
      errorMessage.includes('Protocol error') ||
      errorMessage.includes('Session closed') ||
      errorMessage.includes('Connection closed') ||
      errorMessage.includes('WebSocket is not open')
    );
  }

  /**
   * Reconnect browser instance
   */
  private async reconnectBrowser(): Promise<void> {
    if (!this.browserFactory) {
      throw new Error('Browser factory not set. Cannot reconnect.');
    }

    try {
      // Close old browser if still connected
      if (this.browser?.isConnected()) {
        await this.browser.close().catch(() => {
          // Ignore errors during close
        });
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    // Create new browser instance
    const newBrowser = await this.browserFactory();
    this.browser = newBrowser;

    this.log('Browser reconnected successfully');

    // Notify callback if provided
    if (this.options.onReconnect) {
      await this.options.onReconnect(newBrowser);
    }
  }

  /**
   * Create user-friendly error for reconnection failure
   */
  private createReconnectionFailedError(attempts: number, lastError: any): Error {
    const message = `
❌ Chrome DevTools接続エラー

${attempts}回の再接続を試みましたが、Chrome DevToolsとの接続を回復できませんでした。

📋 最後のエラー:
${lastError?.message || 'Unknown error'}

🔧 解決方法:
1. Claude Codeを再起動してください
2. Chromeブラウザを完全に終了して再起動してください
3. chrome://extensions でChrome DevTools拡張機能を確認してください

詳細: docs/troubleshooting.md#cdp-connection-error
    `.trim();

    const error = new Error(message);
    error.name = 'CDPReconnectionError';
    return error;
  }

  /**
   * Log message if logging is enabled
   */
  private log(message: string): void {
    if (this.options.enableLogging !== false) {
      console.log(`[ConnectionManager] ${message}`);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current browser instance
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * Get total reconnection attempts made
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Reset reconnection attempt counter
   */
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  /**
   * Check if browser is currently connected
   */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }
}

/**
 * Global connection manager instance
 */
let globalConnectionManager: BrowserConnectionManager | null = null;

/**
 * Get or create global connection manager
 */
export function getConnectionManager(
  options?: ConnectionManagerOptions,
): BrowserConnectionManager {
  if (!globalConnectionManager) {
    globalConnectionManager = new BrowserConnectionManager(options);
  }
  return globalConnectionManager;
}

/**
 * Reset global connection manager (for testing)
 */
export function resetConnectionManager(): void {
  globalConnectionManager = null;
}
