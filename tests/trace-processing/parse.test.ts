/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  addFieldMetricRatings,
  getTraceSummary,
  parseRawTraceBuffer,
} from '../../src/trace-processing/parse.js';

import '../../src/DevtoolsUtils.js';

import {loadTraceAsBuffer} from './fixtures/load.js';

describe('Trace parsing', async () => {
  it('can parse a Uint8Array from Tracing.stop())', async () => {
    const rawData = loadTraceAsBuffer('basic-trace.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    if ('error' in result) {
      assert.fail(`Unexpected parse failure: ${result.error}`);
    }
    assert.ok(result?.parsedTrace);
    assert.ok(result?.insights);
  });

  it('can format results of a trace', async t => {
    const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    if ('error' in result) {
      assert.fail(`Unexpected parse failure: ${result.error}`);
    }
    assert.ok(result?.parsedTrace);
    assert.ok(result?.insights);

    const output = getTraceSummary(result);
    t.assert.snapshot?.(output);
  });

  it('adds ratings to field metrics only', () => {
    const summary = addFieldMetricRatings(`Metrics (lab / observed):
  - LCP: 129 ms
Metrics (field / real users):
  - LCP: 1404 ms (scope: url)
  - LCP breakdown:
    - TTFB: 209 ms (scope: url)
  - INP: 65 ms (scope: url)
  - CLS: 0.26 (scope: url)
Available insights:`);

    assert.match(summary, /- LCP: 129 ms/);
    assert.match(summary, /- LCP: 1404 ms \(good\)/);
    assert.match(summary, /- TTFB: 209 ms \(good\)/);
    assert.match(summary, /- INP: 65 ms \(good\)/);
    assert.match(summary, /- CLS: 0.26 \(poor\)/);
  });

  it('will return a message if there is an error', async () => {
    const result = await parseRawTraceBuffer(undefined);
    assert.deepEqual(result, {
      error: 'No buffer was provided.',
    });
  });
});
