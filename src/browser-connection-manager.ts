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
import {ProtocolError, TimeoutError} from 'puppeteer';

/**
 * Connection manager options
 */
export interface ConnectionManagerOptions {
  maxReconnectAttempts?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  reconnectOverallTimeoutMs?: number;
  enableLogging?: boolean;
  onReconnect?: (browser: Browser) => void | Promise<void>;
  /** Test-only: Random number generator for jitter (0.0-1.0) */
  rng?: () => number;
}

/**
 * Default connection manager options
 */
const DEFAULT_OPTIONS = {
  maxReconnectAttempts: 3,
  initialRetryDelay: 1000, // 1 second
  maxRetryDelay: 10000, // 10 seconds
  reconnectOverallTimeoutMs: 30000, // 30 seconds
  enableLogging: true,
  onReconnect: undefined,
};

/**
 * Connection state enum
 */
enum ConnectionState {
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED',
}

/**
 * Browser Connection Manager
 *
 * Provides automatic reconnection for CDP operations with:
 * - Single-flight pattern to prevent concurrent reconnections
 * - Event-driven detection via browser 'disconnected' event
 * - State machine tracking (CONNECTED | RECONNECTING | CLOSED)
 * - Exponential backoff with jitter to prevent thundering herd
 */
export class BrowserConnectionManager {
  private reconnectAttempts = 0;
  private options: ConnectionManagerOptions;
  private browser: Browser | null = null;
  private browserFactory: (() => Promise<Browser>) | null = null;

  /** Single-flight pattern: prevents concurrent reconnection attempts */
  private reconnectInFlight: Promise<void> | null = null;

  /** Shared reconnection sequence for multiple operations */
  private reconnectSequenceInFlight: Promise<void> | null = null;

  /** Current connection state */
  private state: ConnectionState = ConnectionState.CLOSED;

  /** Disconnected event handler (arrow function to preserve 'this') */
  private onDisconnected = () => {
    this.log('Browser disconnected');
    this.setState(ConnectionState.RECONNECTING);
    // Trigger immediate reconnection (single-flight prevents duplicates)
    void this.triggerReconnect('event:disconnected');
  };

  constructor(options: ConnectionManagerOptions = {}) {
    this.options = {...DEFAULT_OPTIONS, ...options};
  }

  /**
   * Set browser instance and factory for reconnection
   *
   * @param browser - Browser instance to manage
   * @param factory - Factory function to create new browser instances on reconnection
   */
  setBrowser(browser: Browser, factory: () => Promise<Browser>): void {
    // Remove old listener to prevent memory leak
    if (this.browser) {
      this.browser.off('disconnected', this.onDisconnected);
    }

    this.browser = browser;
    this.browserFactory = factory;
    this.state = ConnectionState.CONNECTED;

    // Event-driven detection: hook into browser 'disconnected' event
    this.browser.on('disconnected', this.onDisconnected);

    this.log('Browser instance set, state: CONNECTED');
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
        this.log(
          `CDP connection error in ${operationName}, attempting reconnect...`,
        );
        return await this.retryWithReconnect(operation, operationName);
      }
      throw error;
    }
  }

  /**
   * Trigger reconnection sequence
   *
   * Can be called from events (disconnected) or operations (executeWithRetry).
   * Uses single-flight pattern to prevent duplicate reconnections.
   *
   * @param reason - Reason for triggering reconnection
   * @returns Promise that resolves when reconnection completes
   */
  private async triggerReconnect(reason: string): Promise<void> {
    // Single-flight: return existing sequence if already running
    if (this.reconnectSequenceInFlight) {
      this.log(`Reconnection already in progress (${reason}), waiting...`);
      return this.reconnectSequenceInFlight;
    }

    this.log(`Triggering reconnection: ${reason}`);

    // Overall timeout with AbortController
    const abortController = new AbortController();
    const overallTimeout = this.options.reconnectOverallTimeoutMs ?? 30000;
    const timeoutId = setTimeout(() => {
      abortController.abort();
      this.log(`Reconnection overall timeout (${overallTimeout}ms) exceeded`);
    }, overallTimeout);

    // Start reconnection sequence
    this.reconnectSequenceInFlight = this._runReconnectionSequence(
      abortController.signal,
    ).finally(() => {
      clearTimeout(timeoutId);
      this.reconnectSequenceInFlight = null;
    });

    return this.reconnectSequenceInFlight;
  }

  /**
   * Retry operation with automatic reconnection
   *
   * @param operation - Operation to retry
   * @param operationName - Name of operation for logging
   * @returns Result of operation
   */
  private async retryWithReconnect<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    // Use triggerReconnect for unified reconnection logic
    await this.triggerReconnect(`operation:${operationName}`);

    this.log(`${operationName}: Reconnection completed, retrying operation...`);
    return await operation();
  }

  /**
   * Run a full reconnection sequence with exponential backoff
   *
   * This is the actual retry loop that multiple operations can share.
   *
   * @param signal - AbortSignal to cancel reconnection
   * @private
   */
  private async _runReconnectionSequence(signal?: AbortSignal): Promise<void> {
    const maxAttempts = this.options.maxReconnectAttempts ?? 3;
    const initialDelay = this.options.initialRetryDelay ?? 1000;
    const maxDelay = this.options.maxRetryDelay ?? 10000;
    const random = this.options.rng ?? Math.random;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check abort signal
      if (signal?.aborted) {
        throw new Error('Reconnection aborted: overall timeout exceeded');
      }

      this.reconnectAttempts++;
      const attemptNum = attempt + 1;

      this.log(`Reconnect attempt ${attemptNum}/${maxAttempts}...`);

      // Exponential backoff with max delay
      const baseDelay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

      // Add jitter: ±20% randomness to prevent thundering herd
      const jitter = baseDelay * 0.2 * (random() * 2 - 1);
      const delay = Math.max(0, baseDelay + jitter);

      this.log(`Waiting ${delay.toFixed(0)}ms before reconnect attempt...`);
      await this.sleep(delay);

      // Check abort signal after sleep
      if (signal?.aborted) {
        throw new Error('Reconnection aborted: overall timeout exceeded');
      }

      try {
        await this.reconnectBrowser();
        this.log(`Reconnection successful`);
        return; // Success!
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
   *
   * Uses type-safe error detection with instanceof checks and falls back
   * to string matching for compatibility. Also checks method hints.
   *
   * @param error - Error to check
   * @returns true if error is a CDP connection error
   */
  private isCDPConnectionError(error: any): boolean {
    // Type-safe detection using instanceof
    if (error instanceof ProtocolError || error instanceof TimeoutError) {
      return true;
    }

    const msg = String(error?.message ?? '').toLowerCase();
    const method = error?.method?.toString?.().toLowerCase?.() ?? '';

    // Message hints
    if (
      /connection closed|session closed|target closed|websocket is not open/.test(
        msg,
      )
    ) {
      return true;
    }

    // Method hints (CDP methods like 'Target.*')
    if (/^target\./.test(method)) {
      return true;
    }

    return false;
  }

  /**
   * Reconnect browser instance with single-flight pattern
   *
   * Ensures only one reconnection attempt happens at a time.
   * Multiple concurrent calls will wait for the same reconnection promise.
   *
   * @returns Promise that resolves when reconnection is complete
   */
  private async reconnectBrowser(): Promise<void> {
    // Single-flight pattern: return existing promise if reconnection is already in progress
    if (this.reconnectInFlight) {
      this.log('Reconnection already in progress, waiting...');
      return this.reconnectInFlight;
    }

    // Create new reconnection promise
    this.reconnectInFlight = this._doReconnect();

    try {
      await this.reconnectInFlight;
    } finally {
      // Clear in-flight promise when complete
      this.reconnectInFlight = null;
    }
  }

  /**
   * Internal reconnection logic
   *
   * @private
   */
  private async _doReconnect(): Promise<void> {
    if (!this.browserFactory) {
      throw new Error('Browser factory not set. Cannot reconnect.');
    }

    this.setState(ConnectionState.RECONNECTING);

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

    // Re-attach disconnected event handler
    this.browser.on('disconnected', this.onDisconnected);

    this.setState(ConnectionState.CONNECTED);
    this.log('Browser reconnected successfully');

    // Notify callback if provided
    if (this.options.onReconnect) {
      await this.options.onReconnect(newBrowser);
    }
  }

  /**
   * Create user-friendly error for reconnection failure
   */
  private createReconnectionFailedError(
    attempts: number,
    lastError: any,
  ): Error {
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
   * Set connection state and log transition
   *
   * @param newState - New connection state
   */
  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.log(`State transition: ${this.state} -> ${newState}`);
      this.state = newState;
    }
  }

  /**
   * Log message if logging is enabled
   *
   * @param message - Message to log
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
    return new Promise(resolve => setTimeout(resolve, ms));
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
   *
   * @returns true if browser is connected
   */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /**
   * Get current connection state
   *
   * @returns Current connection state (CONNECTED | RECONNECTING | CLOSED)
   */
  getState(): string {
    return this.state;
  }

  /**
   * Check if reconnection is currently in progress
   *
   * @returns true if reconnection is in progress
   */
  isReconnecting(): boolean {
    return this.state === ConnectionState.RECONNECTING;
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
