/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Page } from '../third_party/index.js';
import type { CD4ACommentThread } from '../types.js';
export interface DevToolsCommentBridgeOptions {
    debounceMs?: number;
}
/**
 * Manages the bridge between DevTools frontend comments and the MCP server.
 * Comment events are debounced and delivered to callers that wait for them
 * through `waitForCommentEvent`.
 */
export declare class DevToolsCommentBridge {
    #private;
    constructor(options?: DevToolsCommentBridgeOptions);
    isAttached(devtoolsPage: Page): boolean;
    /**
     * Attaches to the DevTools page if it exposes the CD4A bridge.
     *
     * Returns false if the bridge does not exist, e.g., because the connected
     * Chrome version does not support DevTools comments or the feature is
     * disabled, or if the comment event binding could not be installed.
     * Negative results are not cached so that a DevTools window that has not
     * finished loading yet is checked again on the next call.
     */
    attach(devtoolsPage: Page): Promise<boolean>;
    getComments(devtoolsPage: Page): Promise<CD4ACommentThread[]>;
    /**
     * Resolves `true` on the next debounced comment event, or `false` when
     * `timeoutMs` elapses or the bridge is disposed first.
     */
    waitForCommentEvent(timeoutMs: number): Promise<boolean>;
    dispose(): void;
}
