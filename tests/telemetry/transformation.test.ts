/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  bucketizeLatency,
  sanitizeParams,
} from '../../src/telemetry/transformation.js';
import {zod} from '../../src/third_party/index.js';

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

describe('sanitizeParams', () => {
  it('filters out uid and transforms strings and arrays', () => {
    const schema = {
      uid: zod.string(),
      myString: zod.string(),
      myArray: zod.array(zod.string()),
      myNumber: zod.number(),
      myBool: zod.boolean(),
      myEnum: zod.enum(['a', 'b']),
    };

    const params = {
      uid: 'sensitive',
      myString: 'hello',
      myArray: ['one', 'two'],
      myNumber: 42,
      myBool: true,
      myEnum: 'a' as const,
    };

    const sanitized = sanitizeParams(params, schema);

    assert.deepStrictEqual(sanitized, {
      my_string_length: 5,
      my_array_count: 2,
      my_number: 42,
      my_bool: true,
      my_enum: 'a',
    });
  });

  it('bucketizes string lengths correctly', () => {
    const schema = {
      str0: zod.string(),
      str1: zod.string(),
      str3: zod.string(),
      str5: zod.string(),
      str10000: zod.string(),
      str10001: zod.string(),
    };

    const params = {
      str0: '',
      str1: 'a',
      str3: 'abc',
      str5: 'abcde',
      str10000: 'a'.repeat(10000),
      str10001: 'a'.repeat(10001),
    };

    const sanitized = sanitizeParams(params, schema);

    assert.strictEqual(sanitized.str0_length, 0);
    assert.strictEqual(sanitized.str1_length, 1);
    assert.strictEqual(sanitized.str3_length, 5); // snaps to 5
    assert.strictEqual(sanitized.str5_length, 5);
    assert.strictEqual(sanitized.str10000_length, 10000);
    assert.strictEqual(sanitized.str10001_length, 10000); // snaps to 10000
  });

  it('throws error for unsupported types', () => {
    const schema = {
      myObj: zod.object({foo: zod.string()}),
    };
    const params = {
      myObj: {foo: 'bar'},
    };

    assert.throws(
      () => sanitizeParams(params, schema),
      /Unsupported zod type for tool parameter: ZodObject/,
    );
  });

  it('throws error when value is not of equivalent type', () => {
    const schema = {
      myString: zod.string(),
    };
    const params = {
      myString: 123,
    };

    assert.throws(
      () => sanitizeParams(params, schema),
      /parameter myString has type ZodString but value 123 is not of equivalent type/,
    );
  });
});
