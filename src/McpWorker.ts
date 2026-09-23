/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Target, WebWorker} from './third_party/index.js';

/**
 * The kinds of worker target the browser exposes. Only `service_worker` is
 * surfaced today; the others let the abstraction cover dedicated and shared
 * workers without changing shape.
 */
export type WorkerType =
  'service_worker' | 'dedicated_worker' | 'shared_worker';

/**
 * Short id prefix that labels a worker's type in its id, e.g. `sw-1` for a
 * service worker. The numeric part comes from a single shared counter, so the
 * prefix is a readable type tag rather than a per-type sequence.
 */
const WORKER_ID_PREFIX: Record<WorkerType, string> = {
  service_worker: 'sw',
  dedicated_worker: 'dw',
  shared_worker: 'shw',
};

export function workerIdPrefix(type: WorkerType): string {
  return WORKER_ID_PREFIX[type];
}

// Single shared counter across worker types. Ids are not reused across
// reconnects, mirroring the page id counter in McpContext; the type prefix is
// what distinguishes the kinds, not a per-type sequence.
let nextWorkerId = 1;

/**
 * Wraps a Puppeteer worker {@link Target}, mirroring {@link McpPage}: it owns the
 * target and the stable id assigned to it and lazily resolves the underlying
 * {@link WebWorker}. Generalizes the former plain `ExtensionServiceWorker` type so
 * dedicated and service workers share a single representation.
 */
export class McpWorker {
  readonly id: string;
  readonly type: WorkerType;
  #target: Target;

  constructor(id: string, type: WorkerType, target: Target) {
    this.id = id;
    this.type = type;
    this.#target = target;
  }

  /**
   * Creates a worker with a freshly minted id derived from its type (e.g.
   * `sw-1`). Keeps id composition in one place so callers only supply the type.
   */
  static create(type: WorkerType, target: Target): McpWorker {
    return new McpWorker(
      `${workerIdPrefix(type)}-${nextWorkerId++}`,
      type,
      target,
    );
  }

  /**
   * Resets the shared id counter. For tests only, mirroring
   * McpContext.resetPageIdsForTesting().
   */
  static resetIdsForTesting(): void {
    nextWorkerId = 1;
  }

  get target(): Target {
    return this.#target;
  }

  get url(): string {
    return this.#target.url();
  }

  /**
   * Resolves the worker's execution context, or `undefined` when the target
   * does not expose one (e.g. it closed before the session attached).
   */
  async worker(): Promise<WebWorker | undefined> {
    return (await this.#target.worker()) ?? undefined;
  }
}
