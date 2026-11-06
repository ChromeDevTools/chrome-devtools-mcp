/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { logger } from '../utils/logger.js';
const DEFAULT_DEBOUNCE_MS = 200;
/**
 * Manages the bridge between DevTools frontend comments and the MCP server.
 * Comment events are debounced and delivered to callers that wait for them
 * through `waitForCommentEvent`.
 */
export class DevToolsCommentBridge {
    #debounceMs;
    #commentDebounceTimer;
    #attachedPages = new Set();
    #commentWaiters = new Set();
    constructor(options) {
        this.#debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    }
    isAttached(devtoolsPage) {
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
    async attach(devtoolsPage) {
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
        }
        catch (e) {
            logger?.('DevToolsCommentBridge: evaluate failed', e);
            return false;
        }
        try {
            await devtoolsPage.exposeFunction('__onDevToolsCommentEvent', () => {
                this.#handleCommentEvent();
            });
        }
        catch (e) {
            // The binding may already exist, e.g., exposed by a previous bridge.
            // Whether it is usable is checked in the page below.
            logger?.('DevToolsCommentBridge: exposeFunction already bound or failed', e);
        }
        let attached = false;
        try {
            attached = await devtoolsPage.evaluate(() => {
                const cd4aBridge = window.universe?.cd4aBridge;
                if (!cd4aBridge ||
                    typeof window.__onDevToolsCommentEvent !== 'function') {
                    return false;
                }
                if (window.__onDevToolsCommentListener) {
                    cd4aBridge.removeEventListener('CommentThreadsChanged', window.__onDevToolsCommentListener);
                }
                window.__onDevToolsCommentListener = () => {
                    window.__onDevToolsCommentEvent?.();
                };
                cd4aBridge.addEventListener('CommentThreadsChanged', window.__onDevToolsCommentListener);
                cd4aBridge.setAgentAttached(true);
                return true;
            });
        }
        catch (e) {
            logger?.('DevToolsCommentBridge: evaluate failed', e);
        }
        if (!attached) {
            return false;
        }
        this.#attachedPages.add(devtoolsPage);
        return true;
    }
    async getComments(devtoolsPage) {
        return await devtoolsPage.evaluate(() => {
            window.universe?.cd4aBridge?.setAgentAttached(true);
            return window.universe?.cd4aBridge?.getCommentThreads() ?? [];
        });
    }
    /**
     * Resolves `true` on the next debounced comment event, or `false` when
     * `timeoutMs` elapses or the bridge is disposed first.
     */
    waitForCommentEvent(timeoutMs) {
        return new Promise(resolve => {
            const settle = (changed) => {
                clearTimeout(timer);
                this.#commentWaiters.delete(settle);
                resolve(changed);
            };
            const timer = setTimeout(() => {
                settle(false);
            }, timeoutMs);
            this.#commentWaiters.add(settle);
        });
    }
    #handleCommentEvent() {
        if (this.#commentDebounceTimer) {
            clearTimeout(this.#commentDebounceTimer);
        }
        this.#commentDebounceTimer = setTimeout(() => {
            this.#notifyCommentWaiters(true);
        }, this.#debounceMs);
    }
    #notifyCommentWaiters(changed) {
        for (const waiter of [...this.#commentWaiters]) {
            waiter(changed);
        }
    }
    dispose() {
        if (this.#commentDebounceTimer) {
            clearTimeout(this.#commentDebounceTimer);
            this.#commentDebounceTimer = undefined;
        }
        this.#notifyCommentWaiters(false);
        for (const page of this.#attachedPages) {
            try {
                const result = page.evaluate(() => {
                    if (window.__onDevToolsCommentListener) {
                        window.universe?.cd4aBridge?.removeEventListener('CommentThreadsChanged', window.__onDevToolsCommentListener);
                        delete window.__onDevToolsCommentListener;
                    }
                    window.universe?.cd4aBridge?.setAgentAttached(false);
                });
                if (result && typeof result.catch === 'function') {
                    void result.catch(e => {
                        logger?.('DevToolsCommentBridge: failed to remove event listener', e);
                    });
                }
            }
            catch (e) {
                logger?.('DevToolsCommentBridge: failed to remove event listener', e);
            }
        }
        this.#attachedPages.clear();
    }
}
//# sourceMappingURL=DevToolsCommentBridge.js.map