/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type LockMode = 'shared' | 'exclusive';

export interface LockRequest {
  key: string;
  mode: LockMode;
}

interface Waiter {
  modes: Map<string, LockMode>;
  granted: boolean;
  resolve: () => void;
}

/**
 * A reader/writer lock over string keys. Each key has a FIFO queue.
 *
 * A request with several keys enters every queue synchronously, so two
 * requests have the same relative order in every queue they share. This rules
 * out lock-order deadlocks between multi-key requests.
 *
 * A request is granted when, in each of its queues, every earlier entry is
 * shared and the request itself is shared. An exclusive waiter therefore
 * blocks later shared waiters on the same key, so no waiter starves.
 */
export class KeyedLock {
  #queues = new Map<string, Waiter[]>();

  async acquire(requests: LockRequest[]): Promise<Disposable> {
    if (requests.length === 0) {
      throw new Error('KeyedLock.acquire() requires at least one key.');
    }
    const {promise, resolve} = Promise.withResolvers<void>();
    const waiter: Waiter = {modes: new Map(), granted: false, resolve};
    for (const {key, mode} of requests) {
      // The strongest mode wins when a key is requested twice.
      const current = waiter.modes.get(key);
      if (current === 'exclusive') {
        continue;
      }
      if (current === undefined) {
        const queue = this.#queues.get(key) ?? [];
        queue.push(waiter);
        this.#queues.set(key, queue);
      }
      waiter.modes.set(key, mode);
    }
    this.#grantReady(waiter.modes.keys());
    await promise;
    let released = false;
    return {
      [Symbol.dispose]: () => {
        if (released) {
          throw new Error('KeyedLock guard was already released.');
        }
        released = true;
        this.#release(waiter);
      },
    };
  }

  #canGrant(waiter: Waiter): boolean {
    for (const [key, mode] of waiter.modes) {
      for (const other of this.#queues.get(key) ?? []) {
        if (other === waiter) {
          break;
        }
        if (mode === 'exclusive' || other.modes.get(key) === 'exclusive') {
          return false;
        }
      }
    }
    return true;
  }

  #grantReady(keys: Iterable<string>): void {
    for (const key of keys) {
      for (const waiter of this.#queues.get(key) ?? []) {
        if (!waiter.granted && this.#canGrant(waiter)) {
          waiter.granted = true;
          waiter.resolve();
        }
      }
    }
  }

  #release(waiter: Waiter): void {
    for (const key of waiter.modes.keys()) {
      const queue = this.#queues.get(key);
      if (!queue) {
        continue;
      }
      queue.splice(queue.indexOf(waiter), 1);
      if (queue.length === 0) {
        this.#queues.delete(key);
      }
    }
    this.#grantReady(waiter.modes.keys());
  }
}
