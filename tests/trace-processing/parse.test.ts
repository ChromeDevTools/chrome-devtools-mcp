/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  addRatingsToCruxMetrics,
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

  describe('addRatingsToCruxMetrics', () => {
    it('adds good rating for fast LCP', () => {
      const input = '  - LCP: 1500 ms (scope: url)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - LCP: 1500 ms (scope: url) [good]',
      );
    });

    it('adds needs-improvement rating for moderate LCP', () => {
      const input = '  - LCP: 3000 ms (scope: url)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - LCP: 3000 ms (scope: url) [needs-improvement]',
      );
    });

    it('adds poor rating for slow LCP', () => {
      const input = '  - LCP: 5000 ms (scope: url)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - LCP: 5000 ms (scope: url) [poor]',
      );
    });

    it('adds good rating for fast INP', () => {
      const input = '  - INP: 100 ms (scope: url)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - INP: 100 ms (scope: url) [good]',
      );
    });

    it('adds good rating for low CLS', () => {
      const input = '  - CLS: 0.05 (scope: url)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - CLS: 0.05 (scope: url) [good]',
      );
    });

    it('adds poor rating for high CLS', () => {
      const input = '  - CLS: 0.30 (scope: url)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - CLS: 0.30 (scope: url) [poor]',
      );
    });

    it('adds rating for FCP', () => {
      const input = '  - FCP: 2500 ms (scope: origin)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - FCP: 2500 ms (scope: origin) [needs-improvement]',
      );
    });

    it('adds rating for TTFB', () => {
      const input = '  - TTFB: 500 ms (scope: url)';
      assert.strictEqual(
        addRatingsToCruxMetrics(input),
        '  - TTFB: 500 ms (scope: url) [good]',
      );
    });

    it('does not modify non-CrUX lines', () => {
      const input = '  - LCP: 1500 ms, event: (eventKey: 1, ts: 123)';
      assert.strictEqual(addRatingsToCruxMetrics(input), input);
    });

    it('handles multi-line summary with mixed content', () => {
      const input = [
        'Metrics (field / real users):',
        '  - LCP: 2595 ms (scope: url)',
        '  - LCP breakdown:',
        '    - TTFB: 1273 ms (scope: url)',
        '  - INP: 140 ms (scope: url)',
        '  - CLS: 0.06 (scope: url)',
        '  - The above data is from CrUX',
      ].join('\n');
      const expected = [
        'Metrics (field / real users):',
        '  - LCP: 2595 ms (scope: url) [needs-improvement]',
        '  - LCP breakdown:',
        '    - TTFB: 1273 ms (scope: url) [needs-improvement]',
        '  - INP: 140 ms (scope: url) [good]',
        '  - CLS: 0.06 (scope: url) [good]',
        '  - The above data is from CrUX',
      ].join('\n');
      assert.strictEqual(addRatingsToCruxMetrics(input), expected);
    });
  });

  it('will return a message if there is an error', async () => {
    const result = await parseRawTraceBuffer(undefined);
    assert.deepEqual(result, {
      error: 'No buffer was provided.',
    });
  });
});
