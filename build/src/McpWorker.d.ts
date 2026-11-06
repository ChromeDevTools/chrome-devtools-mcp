/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Target, WebWorker } from './third_party/index.js';
/**
 * The kinds of worker target the browser exposes. Only `service_worker` is
 * surfaced today; the others let the abstraction cover dedicated and shared
 * workers without changing shape.
 */
export type WorkerType = 'service_worker' | 'dedicated_worker' | 'shared_worker';
export declare function workerIdPrefix(type: WorkerType): string;
/**
 * Wraps a Puppeteer worker {@link Target}, mirroring {@link McpPage}: it owns the
 * target and the stable id assigned to it and lazily resolves the underlying
 * {@link WebWorker}. Generalizes the former plain `ExtensionServiceWorker` type so
 * dedicated and service workers share a single representation.
 */
export declare class McpWorker {
    #private;
    readonly id: string;
    readonly type: WorkerType;
    constructor(id: string, type: WorkerType, target: Target);
    /**
     * Creates a worker with a freshly minted id derived from its type (e.g.
     * `sw-1`). Keeps id composition in one place so callers only supply the type.
     */
    static create(type: WorkerType, target: Target): McpWorker;
    /**
     * Resets the shared id counter. For tests only, mirroring
     * McpContext.resetPageIdsForTesting().
     */
    static resetIdsForTesting(): void;
    get target(): Target;
    get url(): string;
    /**
     * Resolves the worker's execution context, or `undefined` when the target
     * does not expose one (e.g. it closed before the session attached).
     */
    worker(): Promise<WebWorker | undefined>;
}
