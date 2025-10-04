/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A simple asynchronous mutex implementation.
 * @public
 */
export class Mutex {
  /**
   * A guard that releases the mutex when disposed.
   * @public
   */
  static Guard = class Guard {
    #mutex: Mutex;
    constructor(mutex: Mutex) {
      this.#mutex = mutex;
    }
    /**
     * Releases the mutex.
     */
    dispose(): void {
      return this.#mutex.release();
    }
  };

  #locked = false;
  #acquirers: Array<() => void> = [];

  /**
   * Acquires the mutex, waiting if necessary. This is a FIFO queue.
   *
   * @returns A promise that resolves with a guard, which will release the
   * mutex when disposed.
   */
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

  /**
   * Releases the mutex.
   * @internal
   */
  release(): void {
    const resolve = this.#acquirers.shift();
    if (!resolve) {
      this.#locked = false;
      return;
    }
    resolve();
  }
}
