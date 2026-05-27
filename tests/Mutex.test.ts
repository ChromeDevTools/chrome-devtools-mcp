/**
 * @license
 * Copyright 2026 Colin (@cejor6)
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {Mutex, MutexRegistry} from '../src/Mutex.js';

describe('Mutex', () => {
  it('is idle when never acquired', () => {
    const m = new Mutex();
    assert.strictEqual(m.isIdle, true);
  });

  it('is not idle while held', async () => {
    const m = new Mutex();
    const g = await m.acquire();
    assert.strictEqual(m.isIdle, false);
    g.dispose();
    assert.strictEqual(m.isIdle, true);
  });

  it('serializes FIFO', async () => {
    const m = new Mutex();
    const order: number[] = [];
    const g1 = await m.acquire();

    const p2 = m.acquire().then(g => {
      order.push(2);
      g.dispose();
    });
    const p3 = m.acquire().then(g => {
      order.push(3);
      g.dispose();
    });

    order.push(1);
    g1.dispose();
    await Promise.all([p2, p3]);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });
});

describe('MutexRegistry', () => {
  it('returns the same per-page mutex for the same pageId', () => {
    const r = new MutexRegistry();
    assert.strictEqual(r.forPage(1), r.forPage(1));
  });

  it('returns different mutexes for different pageIds', () => {
    const r = new MutexRegistry();
    assert.notStrictEqual(r.forPage(1), r.forPage(2));
  });

  it('runs work on different pages in parallel', async () => {
    const r = new MutexRegistry();
    const events: string[] = [];

    async function work(pageId: number, label: string, holdMs: number) {
      const g = await r.forPage(pageId).acquire();
      events.push(`start-${label}`);
      await new Promise(resolve => setTimeout(resolve, holdMs));
      events.push(`end-${label}`);
      g.dispose();
    }

    await Promise.all([work(1, 'a', 30), work(2, 'b', 30)]);
    // If they were serialized we'd see start-a, end-a, start-b, end-b.
    // Concurrent: both starts before either end.
    assert.strictEqual(events[0]?.startsWith('start-'), true);
    assert.strictEqual(events[1]?.startsWith('start-'), true);
    assert.strictEqual(events[2]?.startsWith('end-'), true);
    assert.strictEqual(events[3]?.startsWith('end-'), true);
  });

  it('serializes work on the same page', async () => {
    const r = new MutexRegistry();
    const events: string[] = [];

    async function work(label: string) {
      const g = await r.forPage(1).acquire();
      events.push(`start-${label}`);
      await new Promise(resolve => setTimeout(resolve, 10));
      events.push(`end-${label}`);
      g.dispose();
    }

    await Promise.all([work('a'), work('b')]);
    assert.deepStrictEqual(events, ['start-a', 'end-a', 'start-b', 'end-b']);
  });

  it('acquireExclusive blocks until all per-page mutexes are released', async () => {
    const r = new MutexRegistry();
    const events: string[] = [];

    // Acquire two per-page locks first to populate the registry.
    const g1 = await r.forPage(1).acquire();
    const g2 = await r.forPage(2).acquire();

    let exclusiveAcquired = false;
    const exclusivePromise = r.acquireExclusive().then(g => {
      exclusiveAcquired = true;
      events.push('exclusive');
      g.dispose();
    });

    // Yield so the exclusive acquire has a chance to progress (it shouldn't).
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.strictEqual(
      exclusiveAcquired,
      false,
      'exclusive should be blocked while per-page locks are held',
    );

    events.push('release-1');
    g1.dispose();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.strictEqual(
      exclusiveAcquired,
      false,
      'exclusive should still be blocked while one per-page lock is held',
    );

    events.push('release-2');
    g2.dispose();
    await exclusivePromise;
    assert.deepStrictEqual(events, ['release-1', 'release-2', 'exclusive']);
  });

  it('per-page acquires wait while acquireExclusive is held', async () => {
    const r = new MutexRegistry();
    // Pre-populate registry with mutex for page 1 so exclusive drains it.
    r.forPage(1);

    const exclusiveGuard = await r.acquireExclusive();

    let pageAcquired = false;
    const pagePromise = r
      .forPage(1)
      .acquire()
      .then(g => {
        pageAcquired = true;
        g.dispose();
      });

    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(
      pageAcquired,
      false,
      'page acquire should wait for exclusive to release',
    );

    exclusiveGuard.dispose();
    await pagePromise;
    assert.strictEqual(pageAcquired, true);
  });

  it('drop removes idle entries', () => {
    const r = new MutexRegistry();
    const m1 = r.forPage(1);
    r.drop(1);
    // After drop, a fresh forPage(1) should return a different instance.
    assert.notStrictEqual(r.forPage(1), m1);
  });

  it('drop is a no-op for held mutexes', async () => {
    const r = new MutexRegistry();
    const m1 = r.forPage(1);
    const g = await m1.acquire();
    r.drop(1);
    // Mutex is still in the registry because it's not idle.
    assert.strictEqual(r.forPage(1), m1);
    g.dispose();
  });
});
