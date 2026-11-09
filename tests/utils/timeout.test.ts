/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {TimeoutError} from '../../src/third_party/index.js';
import {withTimeout} from '../../src/utils/timeout.js';

describe('withTimeout', () => {
  it('returns the value when the promise settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('value'), {
      timeout: 1000,
      message: 'timed out',
    });
    assert.strictEqual(result, 'value');
  });

  it('rejects with a TimeoutError when the promise does not settle in time', async () => {
    const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const result = withTimeout(new Promise(() => {}), {
      timeout: 1000,
      message: 'timed out',
    });
    const assertion = assert.rejects(result, (error: unknown) => {
      assert.ok(error instanceof TimeoutError);
      assert.strictEqual(error.message, 'timed out');
      return true;
    });
    await clock.tickAsync(1000);
    await assertion;
  });
});
