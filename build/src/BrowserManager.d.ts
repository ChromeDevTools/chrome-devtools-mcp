/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import type { ReadonlyServerConfig } from './config/ServerConfig.js';
import { type Browser } from './third_party/index.js';
export interface BrowserManagerOptions {
    logFile?: fs.WriteStream;
}
export declare class BrowserManager {
    #private;
    constructor(config: ReadonlyServerConfig, options?: BrowserManagerOptions);
    static makeTargetFilter(enableExtensions?: boolean): (target: {
        url(): string;
    }) => boolean;
    static detectDisplay(): void;
    /**
     * Chrome refuses to start as root unless the sandbox is explicitly disabled and
     * only says so on its stderr. Because we launch with `pipe: true`, Puppeteer
     * never surfaces that stderr and the failure reaches the client as an opaque
     * `Protocol error (Target.setDiscoverTargets): Target closed`. Detect the
     * situation and explain the way out instead. See https://crbug.com/638180.
     *
     * Returns `undefined` when the failure cannot be explained by running as root,
     * including on platforms without uids and when the sandbox was already disabled
     * through `--chrome-arg` (in which case root is not what stopped Chrome).
     */
    static rootSandboxLaunchError(error: Error, args: readonly string[], uid?: number | undefined): Error | undefined;
    ensureBrowser(): Promise<Browser>;
    /**
     * Signals that whoever was waiting on the in-flight ensureBrowser() call
     * has given up (e.g. a tool-call timeout). There's no way to cancel a
     * pending connect()/launch(), so this doesn't stop it — it rotates the
     * token to a fresh value and clears #initPromise, so a late-resolving
     * attempt gets discarded by #ensureBrowserLocked() instead of silently
     * installed for a caller who already walked away.
     *
     * Also forgets the cached #browser, if any. This only ever fires from a
     * getContext()-level timeout, which covers both ensureBrowser() and the
     * McpContext initialization built on it — if ensureBrowser() already
     * resolved and it's that later step hanging (e.g. a dead CDP transport),
     * the token rotation alone does nothing, since #browser is already
     * cached. Safe to forget unconditionally here: a tool call that already
     * received a Browser keeps using it, so forgetting the cached value only
     * makes the next ensureBrowser() reconnect.
     */
    abandonPendingAttempt(): void;
    /**
     * Shutdown hook for the active browser. Closes a launched browser (so the
     * Chrome subprocess is reaped) or disconnects from an attached browser (so
     * the user's Chrome instance stays alive). No-op if no browser is active or
     * the connection has already been dropped.
     */
    close(): Promise<void>;
    [Symbol.dispose](): void;
    [Symbol.asyncDispose](): Promise<void>;
}
