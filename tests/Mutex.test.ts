import {describe, it} from 'node:test';
import {Mutex} from '../src/Mutex.js';
import assert from 'node:assert';

describe('Mutex', () => {
  it('should acquire and release the lock', async () => {
    const mutex = new Mutex();
    const guard = await mutex.acquire();
    guard.dispose();
  });

  it('should ensure only one user can acquire the lock at a time', async () => {
    const mutex = new Mutex();
    await mutex.acquire();

    let acquired = false;
    mutex.acquire().then(() => {
      acquired = true;
    });

    // Give the promise a chance to resolve if it's not waiting for the lock.
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(acquired, false, 'Mutex should not have been acquired');
  });

  it('should allow acquiring the lock again after it has been released', async () => {
    const mutex = new Mutex();
    const guard1 = await mutex.acquire();
    guard1.dispose();

    const guard2 = await mutex.acquire();
    guard2.dispose();
  });

  it('should handle multiple concurrent requests in FIFO order', async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const p1 = mutex.acquire().then(guard => {
      order.push(1);
      guard.dispose();
    });

    const p2 = mutex.acquire().then(guard => {
      order.push(2);
      guard.dispose();
    });

    const p3 = mutex.acquire().then(guard => {
      order.push(3);
      guard.dispose();
    });

    await Promise.all([p1, p2, p3]);

    assert.deepStrictEqual(order, [1, 2, 3], 'The mutex should have been acquired in FIFO order');
  });

  it('should work with async/await', async () => {
    const mutex = new Mutex();
    const guard = await mutex.acquire();

    let acquired = false;
    mutex.acquire().then(() => {
      acquired = true;
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(acquired, false, 'Mutex should not have been acquired');

    guard.dispose();

    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(acquired, true, 'Mutex should have been acquired');
  });
});