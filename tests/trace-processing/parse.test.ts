/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {
  InsightName,
  TraceParseError,
  TraceResult,
} from '../../src/trace-processing/parse.js';
import {
  getInsightOutput,
  getTraceSummary,
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../../src/trace-processing/parse.js';

import {loadTraceAsBuffer} from './fixtures/load.js';

async function parseTrace(fileName: string): Promise<TraceResult> {
  const rawData = loadTraceAsBuffer(fileName);
  const result = await parseRawTraceBuffer(rawData);
  if (!traceResultIsSuccess(result)) {
    assert.fail(`Unexpected trace parse error: ${result.error}`);
  }
  return result;
}

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
    t.assert.snapshot(output);
  });

  it('will return a message if there is an error', async () => {
    const result = await parseRawTraceBuffer(undefined);
    assert.deepEqual(result, {
      error: 'No buffer was provided.',
    });
  });

  it('will return a message if the buffer decodes to an empty string', async () => {
    const result = await parseRawTraceBuffer(new Uint8Array());
    assert.deepEqual(result, {
      error: 'Decoding the trace buffer returned an empty string.',
    });
  });

  it('will return a message if the buffer is not valid JSON', async () => {
    const result = await parseRawTraceBuffer(
      new TextEncoder().encode('this is not valid JSON'),
    );
    if (traceResultIsSuccess(result)) {
      assert.fail('Expected a parse error for invalid JSON input.');
    }
    assert.match(result.error, /JSON/);
  });

  it('will return a message if the JSON is not a valid trace', async () => {
    const result = await parseRawTraceBuffer(
      new TextEncoder().encode('{"notATrace": true}'),
    );
    if (traceResultIsSuccess(result)) {
      assert.fail('Expected a parse error for a non-trace JSON input.');
    }
    assert.ok(result.error.length > 0);
  });
});

describe('traceResultIsSuccess', () => {
  it('returns true for the result of a successful parse', async () => {
    const rawData = loadTraceAsBuffer('basic-trace.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    assert.strictEqual(traceResultIsSuccess(result), true);
  });

  it('returns true for a trace result without insights', async () => {
    const result = await parseTrace('basic-trace.json.gz');
    const withoutInsights: TraceResult = {
      parsedTrace: result.parsedTrace,
      insights: null,
    };
    assert.strictEqual(traceResultIsSuccess(withoutInsights), true);
  });

  it('returns false for the result of a failed parse', async () => {
    const result = await parseRawTraceBuffer(undefined);
    assert.strictEqual(traceResultIsSuccess(result), false);
  });

  it('returns false for a parse error object', () => {
    const error: TraceParseError = {error: 'Something went wrong.'};
    assert.strictEqual(traceResultIsSuccess(error), false);
  });

  it('checks for the parsedTrace key, not the error message contents', () => {
    const error: TraceParseError = {error: 'parsedTrace'};
    assert.strictEqual(traceResultIsSuccess(error), false);
  });
});

describe('getInsightOutput', () => {
  it('returns the formatted output for a known insight', async () => {
    const result = await parseTrace('web-dev-with-commit.json.gz');
    const insight = getInsightOutput(result, 'NAVIGATION_0', 'LCPBreakdown');
    if ('error' in insight) {
      assert.fail(`Unexpected insight error: ${insight.error}`);
    }
    assert.match(insight.output, /Insight Title: LCP breakdown/);
  });

  it('returns an error if the trace has no insights', async () => {
    const result = await parseTrace('web-dev-with-commit.json.gz');
    const withoutInsights: TraceResult = {
      parsedTrace: result.parsedTrace,
      insights: null,
    };
    const insight = getInsightOutput(
      withoutInsights,
      'NAVIGATION_0',
      'LCPBreakdown',
    );
    assert.deepEqual(insight, {
      error: 'No Performance insights are available for this trace.',
    });
  });

  it('returns an error for an unknown insight set id', async () => {
    const result = await parseTrace('web-dev-with-commit.json.gz');
    const insight = getInsightOutput(result, 'NOT_A_SET_ID', 'LCPBreakdown');
    assert.deepEqual(insight, {
      error:
        'No Performance Insights for the given insight set id. Only use ids given in the "Available insight sets" list.',
    });
  });

  it('returns an error for an unknown insight name', async () => {
    const result = await parseTrace('web-dev-with-commit.json.gz');
    const insight = getInsightOutput(
      result,
      'NAVIGATION_0',
      'NotARealInsight' as InsightName,
    );
    assert.deepEqual(insight, {
      error:
        'No Insight with the name NotARealInsight found. Double check the name you provided is accurate and try again.',
    });
  });
});
