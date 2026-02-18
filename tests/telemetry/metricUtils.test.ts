/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {bucketizeLatency} from '../../src/telemetry/metricUtils.js';

describe('bucketizeLatency', () => {
  it('should bucketize values correctly', () => {
    assert.strictEqual(bucketizeLatency(0), 50);
    assert.strictEqual(bucketizeLatency(25), 50);
    assert.strictEqual(bucketizeLatency(50), 50);

    assert.strictEqual(bucketizeLatency(51), 100);
    assert.strictEqual(bucketizeLatency(100), 100);

    assert.strictEqual(bucketizeLatency(101), 250);
    assert.strictEqual(bucketizeLatency(250), 250);

    assert.strictEqual(bucketizeLatency(499), 500);
    assert.strictEqual(bucketizeLatency(500), 500);

    assert.strictEqual(bucketizeLatency(900), 1000);
    assert.strictEqual(bucketizeLatency(1000), 1000);

    assert.strictEqual(bucketizeLatency(2000), 2500);
    assert.strictEqual(bucketizeLatency(2500), 2500);

    assert.strictEqual(bucketizeLatency(4000), 5000);
    assert.strictEqual(bucketizeLatency(5000), 5000);

    assert.strictEqual(bucketizeLatency(6000), 10000);
    assert.strictEqual(bucketizeLatency(10000), 10000);

    assert.strictEqual(bucketizeLatency(10001), 10000);
    assert.strictEqual(bucketizeLatency(99999), 10000);
  });
});
