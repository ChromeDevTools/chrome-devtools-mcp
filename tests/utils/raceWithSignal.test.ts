/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {describe, it} from 'node:test';

import {raceWithSignal} from '../../src/utils/raceWithSignal.js';

describe('raceWithSignal', () => {
  it('returns the result and removes the abort listener', async () => {
    const controller = new AbortController();
    assert.strictEqual(
      await raceWithSignal(Promise.resolve(42), controller.signal),
      42,
    );
    assert.deepStrictEqual(getEventListeners(controller.signal, 'abort'), []);
  });

  it('propagates rejection and removes the abort listener', async () => {
    const controller = new AbortController();
    const error = new Error('operation failed');
    await assert.rejects(
      raceWithSignal(Promise.reject(error), controller.signal),
      reason => reason === error,
    );
    assert.deepStrictEqual(getEventListeners(controller.signal, 'abort'), []);
  });

  for (const alreadyAborted of [false, true]) {
    it(`preserves cancellation and observes late rejection (alreadyAborted=${alreadyAborted})`, async () => {
      const controller = new AbortController();
      const operation = Promise.withResolvers<void>();
      if (alreadyAborted) {
        controller.abort('request cancelled');
      }
      const result = raceWithSignal(operation.promise, controller.signal);
      controller.abort('request cancelled');
      await assert.rejects(result, reason => reason === 'request cancelled');
      assert.deepStrictEqual(getEventListeners(controller.signal, 'abort'), []);
      operation.reject(new Error('late failure'));
    });
  }
});
