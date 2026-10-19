/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {KeyedLock} from '../../src/utils/KeyedLock.js';

async function settle(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
}

function track<T>(promise: Promise<T>): {
  promise: Promise<T>;
  isSettled: () => boolean;
} {
  let settled = false;
  const tracked = promise.then(
    value => {
      settled = true;
      return value;
    },
    err => {
      settled = true;
      throw err;
    },
  );
  return {promise: tracked, isSettled: () => settled};
}

describe('KeyedLock', () => {
  it('grants two shared requests on one key at the same time', async () => {
    const lock = new KeyedLock();
    const first = await lock.acquire([{key: 'a', mode: 'shared'}]);
    const second = track(lock.acquire([{key: 'a', mode: 'shared'}]));
    await settle();
    assert.strictEqual(second.isSettled(), true);
    first[Symbol.dispose]();
    (await second.promise)[Symbol.dispose]();
  });

  it('makes an exclusive request wait for a shared holder', async () => {
    const lock = new KeyedLock();
    const shared = await lock.acquire([{key: 'a', mode: 'shared'}]);
    const exclusive = track(lock.acquire([{key: 'a', mode: 'exclusive'}]));
    await settle();
    assert.strictEqual(exclusive.isSettled(), false);
    shared[Symbol.dispose]();
    await settle();
    assert.strictEqual(exclusive.isSettled(), true);
    (await exclusive.promise)[Symbol.dispose]();
  });

  it('makes a shared request wait behind an exclusive waiter', async () => {
    const lock = new KeyedLock();
    const holder = await lock.acquire([{key: 'a', mode: 'shared'}]);
    const exclusive = track(lock.acquire([{key: 'a', mode: 'exclusive'}]));
    const lateShared = track(lock.acquire([{key: 'a', mode: 'shared'}]));
    await settle();
    assert.strictEqual(exclusive.isSettled(), false);
    assert.strictEqual(lateShared.isSettled(), false);

    holder[Symbol.dispose]();
    await settle();
    assert.strictEqual(exclusive.isSettled(), true);
    assert.strictEqual(lateShared.isSettled(), false);

    (await exclusive.promise)[Symbol.dispose]();
    await settle();
    assert.strictEqual(lateShared.isSettled(), true);
    (await lateShared.promise)[Symbol.dispose]();
  });

  it('does not block requests on different keys', async () => {
    const lock = new KeyedLock();
    const a = await lock.acquire([{key: 'a', mode: 'exclusive'}]);
    const b = track(lock.acquire([{key: 'b', mode: 'exclusive'}]));
    await settle();
    assert.strictEqual(b.isSettled(), true);
    a[Symbol.dispose]();
    (await b.promise)[Symbol.dispose]();
  });

  it('grants a multi-key request only when every key is free', async () => {
    const lock = new KeyedLock();
    const a = await lock.acquire([{key: 'a', mode: 'exclusive'}]);
    const b = await lock.acquire([{key: 'b', mode: 'exclusive'}]);
    const both = track(
      lock.acquire([
        {key: 'a', mode: 'exclusive'},
        {key: 'b', mode: 'exclusive'},
      ]),
    );
    await settle();
    assert.strictEqual(both.isSettled(), false);
    a[Symbol.dispose]();
    await settle();
    assert.strictEqual(both.isSettled(), false);
    b[Symbol.dispose]();
    await settle();
    assert.strictEqual(both.isSettled(), true);

    const guard = await both.promise;
    const afterA = track(lock.acquire([{key: 'a', mode: 'exclusive'}]));
    const afterB = track(lock.acquire([{key: 'b', mode: 'exclusive'}]));
    await settle();
    assert.strictEqual(afterA.isSettled(), false);
    assert.strictEqual(afterB.isSettled(), false);
    guard[Symbol.dispose]();
    await settle();
    assert.strictEqual(afterA.isSettled(), true);
    assert.strictEqual(afterB.isSettled(), true);
    (await afterA.promise)[Symbol.dispose]();
    (await afterB.promise)[Symbol.dispose]();
  });

  it('does not deadlock on multi-key requests in opposite order', async () => {
    const lock = new KeyedLock();
    const holder = await lock.acquire([{key: 'a', mode: 'exclusive'}]);
    const ab = track(
      lock.acquire([
        {key: 'a', mode: 'exclusive'},
        {key: 'b', mode: 'exclusive'},
      ]),
    );
    const ba = track(
      lock.acquire([
        {key: 'b', mode: 'exclusive'},
        {key: 'a', mode: 'exclusive'},
      ]),
    );
    await settle();
    assert.strictEqual(ab.isSettled(), false);
    assert.strictEqual(ba.isSettled(), false);

    holder[Symbol.dispose]();
    await settle();
    assert.strictEqual(ab.isSettled(), true);
    assert.strictEqual(ba.isSettled(), false);

    (await ab.promise)[Symbol.dispose]();
    await settle();
    assert.strictEqual(ba.isSettled(), true);
    (await ba.promise)[Symbol.dispose]();
  });

  it('keeps FIFO order for exclusive waiters', async () => {
    const lock = new KeyedLock();
    const order: number[] = [];
    const holder = await lock.acquire([{key: 'a', mode: 'exclusive'}]);
    const waiters = [1, 2, 3].map(async n => {
      using guard = await lock.acquire([{key: 'a', mode: 'exclusive'}]);
      void guard;
      order.push(n);
    });
    holder[Symbol.dispose]();
    await Promise.all(waiters);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  it('uses the exclusive mode when a key is requested twice', async () => {
    const lock = new KeyedLock();
    const guard = await lock.acquire([
      {key: 'a', mode: 'shared'},
      {key: 'a', mode: 'exclusive'},
    ]);
    const shared = track(lock.acquire([{key: 'a', mode: 'shared'}]));
    await settle();
    assert.strictEqual(shared.isSettled(), false);
    guard[Symbol.dispose]();
    (await shared.promise)[Symbol.dispose]();
  });

  it('throws when a guard is released twice', async () => {
    const lock = new KeyedLock();
    const guard = await lock.acquire([{key: 'a', mode: 'exclusive'}]);
    guard[Symbol.dispose]();
    assert.throws(
      () => guard[Symbol.dispose](),
      /KeyedLock guard was already released/,
    );
  });

  it('rejects a request without keys', async () => {
    const lock = new KeyedLock();
    await assert.rejects(lock.acquire([]), /requires at least one key/);
  });
});
