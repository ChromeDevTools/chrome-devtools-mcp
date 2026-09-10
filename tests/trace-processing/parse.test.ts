/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  getTraceSummary,
  parseRawTraceBuffer,
} from '../../src/processors/PerformanceTrace.js';
import {DevTools} from '../../src/third_party/index.js';

import {loadTraceAsBuffer} from './fixtures/load.js';

describe('Trace parsing', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('creates an isolated model instance for each parsed trace', async () => {
    const createModelSpy = sinon.spy(
      DevTools.TraceEngine.TraceModel.Model,
      'createWithAllHandlers',
    );
    const rawData = loadTraceAsBuffer('basic-trace.json.gz');

    const result1 = await parseRawTraceBuffer(rawData);
    const result2 = await parseRawTraceBuffer(rawData);

    if ('error' in result1) {
      assert.fail(`Unexpected parse failure on first trace: ${result1.error}`);
    }
    if ('error' in result2) {
      assert.fail(`Unexpected parse failure on second trace: ${result2.error}`);
    }

    sinon.assert.calledTwice(createModelSpy);
    const firstModel = createModelSpy.firstCall.returnValue;
    const secondModel = createModelSpy.secondCall.returnValue;
    assert.notStrictEqual(firstModel, secondModel);
    // Verify that each model instance retains only its own trace. If the model
    // were shared, subsequent parses would accumulate in `#traces` and increase size.
    assert.strictEqual(firstModel.size(), 1);
    assert.strictEqual(secondModel.size(), 1);
  });

  it('can parse a Uint8Array from Tracing.stop()', async () => {
    const rawData = loadTraceAsBuffer('basic-trace.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    if ('error' in result) {
      assert.fail(`Unexpected parse failure: ${result.error}`);
    }
    assert.ok(result.parsedTrace);
    assert.ok(result.insights);
  });

  it('can format results of a trace', async t => {
    const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    if ('error' in result) {
      assert.fail(`Unexpected parse failure: ${result.error}`);
    }
    assert.ok(result.parsedTrace);
    assert.ok(result.insights);

    const output = getTraceSummary(result);
    t.assert.snapshot(output);
  });

  it('will return a message if there is an error', async () => {
    const result = await parseRawTraceBuffer(undefined);
    assert.deepEqual(result, {
      error: 'No buffer was provided.',
    });
  });
});
