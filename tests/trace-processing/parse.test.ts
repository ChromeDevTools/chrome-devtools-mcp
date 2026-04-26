/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  getTraceSummary,
  parseRawTraceBuffer,
  rateCLS,
  rateTimingMetric,
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

  describe('rateTimingMetric', () => {
    it('rates fast LCP as good', () => {
      assert.strictEqual(rateTimingMetric('LCP', 1500), 'good');
    });

    it('rates moderate LCP as needs-improvement', () => {
      assert.strictEqual(rateTimingMetric('LCP', 3000), 'needs-improvement');
    });

    it('rates slow LCP as poor', () => {
      assert.strictEqual(rateTimingMetric('LCP', 5000), 'poor');
    });

    it('rates fast INP as good', () => {
      assert.strictEqual(rateTimingMetric('INP', 100), 'good');
    });

    it('rates FCP at boundary as needs-improvement', () => {
      assert.strictEqual(rateTimingMetric('FCP', 2500), 'needs-improvement');
    });

    it('rates fast TTFB as good', () => {
      assert.strictEqual(rateTimingMetric('TTFB', 500), 'good');
    });

    it('returns null for unknown metrics', () => {
      assert.strictEqual(rateTimingMetric('UNKNOWN', 100), null);
    });
  });

  describe('rateCLS', () => {
    it('rates low CLS as good', () => {
      assert.strictEqual(rateCLS(0.05), 'good');
    });

    it('rates moderate CLS as needs-improvement', () => {
      assert.strictEqual(rateCLS(0.15), 'needs-improvement');
    });

    it('rates high CLS as poor', () => {
      assert.strictEqual(rateCLS(0.30), 'poor');
    });
  });

  it('will return a message if there is an error', async () => {
    const result = await parseRawTraceBuffer(undefined);
    assert.deepEqual(result, {
      error: 'No buffer was provided.',
    });
  });
});
