/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from '../third_party/index.js';
import type {CD4ACommentThread} from '../types.js';
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
  readonly #attachedPages = new Set<Page>();

  constructor(options?: DevToolsCommentBridgeOptions) {
    this.#onNotification = options?.onNotification;
    this.#debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  isAttached(devtoolsPage: Page): boolean {
    return this.#attachedPages.has(devtoolsPage);
  }

  /**
   * Attaches to the DevTools page if it exposes the CD4A bridge.
   *
   * Returns false if the bridge does not exist, e.g., because the connected
   * Chrome version does not support DevTools comments or the feature is
   * disabled, or if the comment event binding could not be installed.
   * Negative results are not cached so that a DevTools window that has not
   * finished loading yet is checked again on the next call.
   */
  async attach(devtoolsPage: Page): Promise<boolean> {
    if (this.#attachedPages.has(devtoolsPage)) {
      return true;
    }

    try {
      const hasBridge = await devtoolsPage.evaluate(() => {
        return Boolean(window.universe?.cd4aBridge);
      });
      if (!hasBridge) {
        return false;
      }
    } catch (e) {
      logger?.('DevToolsCommentBridge: evaluate failed', e);
      return false;
    }

    try {
      await devtoolsPage.exposeFunction('__onDevToolsCommentEvent', () => {
        this.#handleCommentEvent();
      });
    } catch (e) {
      // The binding may already exist, e.g., exposed by a previous bridge.
      // Whether it is usable is checked in the page below.
      logger?.(
        'DevToolsCommentBridge: exposeFunction already bound or failed',
        e,
      );
    }

    let attached = false;
    try {
      attached = await devtoolsPage.evaluate(() => {
        const cd4aBridge = window.universe?.cd4aBridge;
        if (
          !cd4aBridge ||
          typeof window.__onDevToolsCommentEvent !== 'function'
        ) {
          return false;
        }
        if (window.__onDevToolsCommentListener) {
          cd4aBridge.removeEventListener(
            'CommentThreadsChanged',
            window.__onDevToolsCommentListener,
          );
        }
        window.__onDevToolsCommentListener = () => {
          window.__onDevToolsCommentEvent?.();
        };
        cd4aBridge.addEventListener(
          'CommentThreadsChanged',
          window.__onDevToolsCommentListener,
        );
        cd4aBridge.setAgentAttached(true);
        return true;
      });
    } catch (e) {
      logger?.('DevToolsCommentBridge: evaluate failed', e);
    }
    if (!attached) {
      return false;
    }
    this.#attachedPages.add(devtoolsPage);
    return true;
  }

  async getComments(devtoolsPage: Page): Promise<CD4ACommentThread[]> {
    return await devtoolsPage.evaluate(() => {
      window.universe?.cd4aBridge?.setAgentAttached(true);
      return window.universe?.cd4aBridge?.getCommentThreads() ?? [];
    });
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
    for (const page of this.#attachedPages) {
      try {
        const result = page.evaluate(() => {
          if (window.__onDevToolsCommentListener) {
            window.universe?.cd4aBridge?.removeEventListener(
              'CommentThreadsChanged',
              window.__onDevToolsCommentListener,
            );
            delete window.__onDevToolsCommentListener;
          }
          window.universe?.cd4aBridge?.setAgentAttached(false);
        });
        if (result && typeof result.catch === 'function') {
          void result.catch(e => {
            logger?.(
              'DevToolsCommentBridge: failed to remove event listener',
              e,
            );
          });
        }
      } catch (e) {
        logger?.('DevToolsCommentBridge: failed to remove event listener', e);
      }
    }
    this.#attachedPages.clear();
  }
}
