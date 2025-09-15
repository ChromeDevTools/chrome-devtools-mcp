/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {
  insightOutput,
  parseRawTraceBuffer,
} from '../../src/trace-processing/parse.js';
import {loadTraceAsBuffer} from './fixtures/load.js';

describe('Trace parsing', async () => {
  it.snapshot.setResolveSnapshotPath(testPath => {
    // By default the snapshots go into the build directory, but we want them
    // in the tests/ directory.
    const correctPath = testPath?.replace('/build/tests', '/tests');
    return correctPath + '.snapshot';
  });

  // The default serializer is JSON.stringify which outputs a very hard to read
  // snapshot. So we override it to one that shows new lines literally rather
  // than via `\n`.
  it.snapshot.setDefaultSnapshotSerializers([String]);

  it('can parse a Uint8Array from Tracing.stop())', async () => {
    const rawData = loadTraceAsBuffer('basic-trace.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    assert.ok(result?.parsedTrace);
    assert.ok(result?.insights);
  });

  it('can format results of a trace', async t => {
    const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    assert.ok(result?.parsedTrace);
    assert.ok(result?.insights);

    const output = insightOutput(result);
    t.assert.snapshot(output);
  });
});
