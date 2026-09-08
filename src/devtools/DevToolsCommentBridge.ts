/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from '../third_party/index.js';
import {logger} from '../utils/logger.js';

export interface DevToolsCommentBridgeOptions {
  onNotification?: (message: string) => void;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 200;

/**
 * Manages the bidirectional bridge between DevTools frontend comments
 * and the MCP server notification system.
 */
export class DevToolsCommentBridge {
  readonly #onNotification?: (message: string) => void;
  readonly #debounceMs: number;
  #commentDebounceTimer?: NodeJS.Timeout;
  readonly #attachedPages = new WeakSet<Page>();

  constructor(options?: DevToolsCommentBridgeOptions) {
    this.#onNotification = options?.onNotification;
    this.#debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  isAttached(devtoolsPage: Page): boolean {
    return this.#attachedPages.has(devtoolsPage);
  }

  async attach(devtoolsPage: Page): Promise<void> {
    if (this.#attachedPages.has(devtoolsPage)) {
      return;
    }
    this.#attachedPages.add(devtoolsPage);

    try {
      await devtoolsPage.exposeFunction('__onDevToolsCommentEvent', () => {
        this.#handleCommentEvent();
      });
    } catch (e) {
      logger?.(
        'DevToolsCommentBridge: exposeFunction already bound or failed',
        e,
      );
    }

    try {
      await devtoolsPage.evaluate(() => {
        window.universe?.cd4aBridge?.addEventListener(
          'CommentThreadsChanged',
          () => {
            window.__onDevToolsCommentEvent?.();
          },
        );
      });
    } catch (e) {
      logger?.('DevToolsCommentBridge: evaluate failed', e);
    }
  }

  #handleCommentEvent(): void {
    if (this.#commentDebounceTimer) {
      clearTimeout(this.#commentDebounceTimer);
    }
    this.#commentDebounceTimer = setTimeout(() => {
      this.#onNotification?.('DevTools comment threads updated');
    }, this.#debounceMs);
  }

  dispose(): void {
    if (this.#commentDebounceTimer) {
      clearTimeout(this.#commentDebounceTimer);
      this.#commentDebounceTimer = undefined;
    }
  }
}
