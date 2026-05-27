/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Modifications Copyright 2026 Colin (@cejor6)
 * - Added `isIdle` getter on Mutex.
 * - Added `MutexRegistry` to hand out per-page mutexes plus a global mutex
 *   for topology-changing operations (new_page, close_page, etc.). This
 *   enables concurrent execution of page-scoped tools across different pages
 *   when `--experimentalPageIdRouting` is on.
 */

export class Mutex {
  static Guard = class Guard {
    #mutex: Mutex;
    constructor(mutex: Mutex) {
      this.#mutex = mutex;
    }
    dispose(): void {
      return this.#mutex.release();
    }
  };

  #locked = false;
  #acquirers: Array<() => void> = [];

  // This is FIFO.
  async acquire(): Promise<InstanceType<typeof Mutex.Guard>> {
    if (!this.#locked) {
      this.#locked = true;
      return new Mutex.Guard(this);
    }
    const {resolve, promise} = Promise.withResolvers<void>();
    this.#acquirers.push(resolve);
    await promise;
    return new Mutex.Guard(this);
  }

  release(): void {
    const resolve = this.#acquirers.shift();
    if (!resolve) {
      this.#locked = false;
      return;
    }
    resolve();
  }

  get isIdle(): boolean {
    return !this.#locked && this.#acquirers.length === 0;
  }
}

/**
 * Hands out per-page mutexes plus a "global" mutex for topology-changing
 * operations (new_page, close_page, select_page, list_pages, etc.).
 *
 * Locking discipline:
 *   - Page-scoped tool with pageId P: briefly touches global (to wait for any
 *     in-flight topology op to drain), then acquires perPage[P]. Two page-
 *     scoped tools on different pages run in parallel.
 *   - Page-scoped tool with no pageId (legacy / routing-off): acquires global,
 *     preserving original single-flight behavior.
 *   - Non-page-scoped tool: acquires global AND every currently-live per-page
 *     mutex (`acquireExclusive`), so no page-scoped work is in flight while
 *     topology mutates.
 */
export interface Guard {
  dispose(): void;
}

export class MutexRegistry {
  #global = new Mutex();
  #perPage = new Map<number, Mutex>();

  global(): Mutex {
    return this.#global;
  }

  forPage(pageId: number): Mutex {
    let m = this.#perPage.get(pageId);
    if (!m) {
      m = new Mutex();
      this.#perPage.set(pageId, m);
    }
    return m;
  }

  /**
   * Drop an idle per-page mutex (e.g. after the page is closed). No-op if the
   * mutex has waiters or is held — in that case the entry persists until the
   * holder releases, which is harmless.
   */
  drop(pageId: number): void {
    const m = this.#perPage.get(pageId);
    if (m && m.isIdle) {
      this.#perPage.delete(pageId);
    }
  }

  /**
   * Acquire global plus every currently-live per-page mutex, in a deterministic
   * order to avoid deadlocks. Used by topology operations.
   *
   * Note: the snapshot of per-page mutexes is taken AFTER global is held, so a
   * page created concurrently (which would itself require global to be created)
   * will be serialized behind us.
   */
  async acquireExclusive(): Promise<Guard> {
    const globalGuard = await this.#global.acquire();
    const pageGuards: Guard[] = [];
    try {
      const sortedIds = [...this.#perPage.keys()].sort((a, b) => a - b);
      for (const id of sortedIds) {
        const m = this.#perPage.get(id);
        if (m) {
          pageGuards.push(await m.acquire());
        }
      }
    } catch (e) {
      for (const g of pageGuards.reverse()) {
        g.dispose();
      }
      globalGuard.dispose();
      throw e;
    }
    return {
      dispose() {
        for (const g of pageGuards.reverse()) {
          g.dispose();
        }
        globalGuard.dispose();
      },
    };
  }
}
