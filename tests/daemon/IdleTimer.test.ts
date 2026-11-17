/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {IdleTimer} from '../../src/daemon/IdleTimer.js';

function createIdleTimer(timeoutMs: number | undefined) {
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

  it('does not call onIdle while an activity is in flight', async () => {
    const {clock, onIdle, timer} = createIdleTimer(1000);
    let finishActivity = () => {};
    const activity = new Promise<void>(resolve => {
      finishActivity = resolve;
    });

    timer.schedule();
    const tracked = timer.track(() => activity);
    await clock.tickAsync(5000);
    sinon.assert.notCalled(onIdle);
    finishActivity();
    await tracked;
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
    await clock.tickAsync(5000);
    sinon.assert.notCalled(onIdle);
    finishLongActivity();
    await tracked;
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

  it('is disabled when no timeout is configured', async () => {
    const {clock, onIdle, timer} = createIdleTimer(undefined);

    timer.schedule();
    await timer.track(async () => {});

    assert.strictEqual(clock.countTimers(), 0);
    sinon.assert.notCalled(onIdle);
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
