/**
 * Base Driver
 *
 * Abstract base class for site drivers using the Template Method pattern.
 * Provides common functionality and defines the execution flow.
 */

import type {CdpClient} from '../cdp-client.js';
import type {
  SiteDriver,
  DriverSelectors,
  SendResult,
  ExtractResult,
  DriverOptions,
} from '../drivers/types.js';
import {DOM_UTILS_CODE} from '../utils/index.js';

/**
 * Abstract base class for site drivers
 *
 * Subclasses must implement:
 * - sendPrompt()
 * - isProcessing()
 * - extractResponse()
 * - needsLogin()
 *
 * Common functionality provided:
 * - waitForResponse() with configurable polling
 * - getCurrentUrl()
 * - DOM utility injection
 */
export abstract class BaseDriver implements SiteDriver {
  abstract readonly name: string;
  abstract readonly selectors: DriverSelectors;

  protected client: CdpClient | null = null;

  /**
   * Set the CDP client for this driver
   */
  setClient(client: CdpClient): void {
    this.client = client;
  }

  /**
   * Get the CDP client, throwing if not set
   */
  protected getClient(): CdpClient {
    if (!this.client) {
      throw new Error(`${this.name} driver: CDP client not set. Call setClient() first.`);
    }
    return this.client;
  }

  /**
   * Evaluate JavaScript with DOM utilities injected
   * @param code - JavaScript code (can use __collectDeep, __isVisible, __isDisabled)
   */
  protected async evaluateWithUtils<T>(code: string): Promise<T> {
    const client = this.getClient();
    const wrappedCode = `
      (() => {
        ${DOM_UTILS_CODE}
        ${code}
      })()
    `;
    return client.evaluate<T>(wrappedCode);
  }

  /**
   * Send a prompt to the AI
   * Must be implemented by subclasses
   */
  abstract sendPrompt(text: string): Promise<SendResult>;

  /**
   * Check if the AI is currently processing
   * Must be implemented by subclasses
   */
  abstract isProcessing(): Promise<boolean>;

  /**
   * Extract the latest response
   * Must be implemented by subclasses
   */
  abstract extractResponse(options?: DriverOptions): Promise<ExtractResult>;

  /**
   * Check if login is required
   * Must be implemented by subclasses
   */
  abstract needsLogin(): Promise<boolean>;

  /**
   * Wait for the response to complete
   * Default implementation polls isProcessing()
   */
  async waitForResponse(options?: DriverOptions): Promise<void> {
    const maxWaitMs = options?.maxWaitMs ?? 480000; // 8 minutes default
    const pollIntervalMs = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const processing = await this.isProcessing();
      if (!processing) {
        return;
      }
      await this.sleep(pollIntervalMs);
    }

    throw new Error(`${this.name}: Timed out waiting for response (${maxWaitMs}ms)`);
  }

  /**
   * Get the current page URL
   */
  async getCurrentUrl(): Promise<string> {
    const client = this.getClient();
    return client.evaluate<string>('location.href');
  }

  /**
   * Sleep for a specified duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log a message with driver context
   */
  protected log(message: string, data?: Record<string, unknown>): void {
    const prefix = `[${this.name}]`;
    if (data) {
      console.error(`${prefix} ${message}`, JSON.stringify(data));
    } else {
      console.error(`${prefix} ${message}`);
    }
  }
}
