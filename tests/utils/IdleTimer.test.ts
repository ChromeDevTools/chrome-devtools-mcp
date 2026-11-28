/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {MAX_SET_TIMEOUT_MS} from '../../src/utils/duration.js';
import {IdleTimer} from '../../src/utils/IdleTimer.js';

function createIdleTimer(timeoutMs: number) {
  const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  const onIdle = sinon.stub();
  const timer = new IdleTimer({timeoutMs, onIdle});
  return {clock, onIdle, timer};
}

describe('IdleTimer', () => {
  it('calls onIdle when the timeout elapses without activity', () => {
    const {clock, onIdle, timer} = createIdleTimer(1000);

    timer.schedule();
    clock.tick(999);
    sinon.assert.notCalled(onIdle);
    clock.tick(1);

    sinon.assert.calledOnceWithExactly(onIdle);
  });

  it('unrefs the scheduled timer handle', () => {
    const setTimeoutSpy = sinon.spy(globalThis, 'setTimeout');
    const timer = new IdleTimer({timeoutMs: 60_000, onIdle: () => {}});

    timer.schedule();
    try {
      sinon.assert.calledOnce(setTimeoutSpy);
      assert.strictEqual(setTimeoutSpy.firstCall.returnValue.hasRef(), false);
    } finally {
      timer.dispose();
    }
  });

  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`rejects non-positive or non-integer timeoutMs ${invalid}`, () => {
      assert.throws(
        () => new IdleTimer({timeoutMs: invalid, onIdle: () => {}}),
        new Error(`Invalid timeoutMs ${invalid}. Expected a positive integer.`),
      );
    });
  }

  it('clamps timeoutMs above MAX_SET_TIMEOUT_MS instead of overflowing setTimeout', () => {
    const {clock, onIdle, timer} = createIdleTimer(MAX_SET_TIMEOUT_MS + 5_000);

    timer.schedule();
    clock.tick(MAX_SET_TIMEOUT_MS - 1);
    sinon.assert.notCalled(onIdle);
    clock.tick(1);

    sinon.assert.calledOnceWithExactly(onIdle);
  });

  it('does not call onIdle while an activity is in flight', async () => {
    const {clock, onIdle, timer} = createIdleTimer(1000);
    let finishActivity = () => {};
    const activity = new Promise<void>(resolve => {
      finishActivity = resolve;
    });

    assert.strictEqual(timer.hasActiveWork, false);
    timer.schedule();
    const tracked = timer.track(() => activity);
    assert.strictEqual(timer.hasActiveWork, true);
    await clock.tickAsync(5000);
    sinon.assert.notCalled(onIdle);
    finishActivity();
    await tracked;
    assert.strictEqual(timer.hasActiveWork, false);
    await clock.tickAsync(999);
    sinon.assert.notCalled(onIdle);
    await clock.tickAsync(1);

    sinon.assert.calledOnceWithExactly(onIdle);
  });

  it('waits for all overlapping activities to finish', async () => {
    const {clock, onIdle, timer} = createIdleTimer(1000);
    let finishLongActivity = () => {};
    const longActivity = new Promise<void>(resolve => {
      finishLongActivity = resolve;
    });

    const tracked = timer.track(() => longActivity);
    await timer.track(async () => {});
    assert.strictEqual(timer.hasActiveWork, true);
    await clock.tickAsync(5000);
    sinon.assert.notCalled(onIdle);
    finishLongActivity();
    await tracked;
    assert.strictEqual(timer.hasActiveWork, false);
    await clock.tickAsync(1000);

    sinon.assert.calledOnceWithExactly(onIdle);
  });

  it('resets the countdown after an activity finishes', async () => {
    const {clock, onIdle, timer} = createIdleTimer(1000);

    timer.schedule();
    await clock.tickAsync(900);
    assert.strictEqual(await timer.track(async () => 'result'), 'result');
    await clock.tickAsync(999);
    sinon.assert.notCalled(onIdle);
    await clock.tickAsync(1);

    sinon.assert.calledOnceWithExactly(onIdle);
  });

  it('resets the countdown after an activity rejects', async () => {
    const {clock, onIdle, timer} = createIdleTimer(1000);

    await assert.rejects(
      timer.track(async () => {
        throw new Error('tool failed');
      }),
      /tool failed/,
    );
    await clock.tickAsync(1000);

    sinon.assert.calledOnceWithExactly(onIdle);
  });

  it('does not call onIdle after dispose', async () => {
    const {clock, onIdle, timer} = createIdleTimer(1000);

    timer.schedule();
    timer.dispose();
    await timer.track(async () => {});

    assert.strictEqual(clock.countTimers(), 0);
    sinon.assert.notCalled(onIdle);
  });
});
