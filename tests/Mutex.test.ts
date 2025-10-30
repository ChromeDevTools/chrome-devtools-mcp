/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {Mutex} from '../src/Mutex.js';

describe('Mutex', () => {
  it('should acquire and release the lock', async () => {
    const mutex = new Mutex();
    const guard = await mutex.acquire();
    guard.dispose();
  });

  it('should prevent multiple acquisitions', async () => {
    const mutex = new Mutex();
    await mutex.acquire();
    let acquired = false;
    mutex.acquire().then(() => {
      acquired = true;
    });
    // Give the promise a chance to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(acquired, false);
  });

  it('should allow acquisition after release', async () => {
    const mutex = new Mutex();
    const guard1 = await mutex.acquire();
    guard1.dispose();
    const guard2 = await mutex.acquire();
    guard2.dispose();
  });

  it('should handle FIFO queuing', async () => {
    const mutex = new Mutex();
    const order: number[] = [];
    const guard = await mutex.acquire();

    const promise1 = mutex.acquire().then(guard1 => {
      order.push(1);
      guard1.dispose();
    });

    const promise2 = mutex.acquire().then(guard2 => {
      order.push(2);
      guard2.dispose();
    });

    guard.dispose();

    await Promise.all([promise1, promise2]);

    assert.deepStrictEqual(order, [1, 2]);
  });
});
