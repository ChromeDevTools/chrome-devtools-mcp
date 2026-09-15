/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  byteSizeRangeSchema,
  parseByteSize,
  parseByteSizeRange,
} from '../../src/utils/bytes.js';

describe('parseByteSize', () => {
  it('should parse plain numeric strings', () => {
    assert.strictEqual(parseByteSize('0'), 0);
    assert.strictEqual(parseByteSize('1024'), 1024);
    assert.strictEqual(parseByteSize('  1048576  '), 1048576);
  });

  it('should parse bytes units', () => {
    assert.strictEqual(parseByteSize('100B'), 100);
    assert.strictEqual(parseByteSize('100b'), 100);
    assert.strictEqual(parseByteSize('100 Bytes'), 100);
    assert.strictEqual(parseByteSize('100 byte'), 100);
  });

  it('should parse kilobytes units', () => {
    assert.strictEqual(parseByteSize('1K'), 1000);
    assert.strictEqual(parseByteSize('1k'), 1000);
    assert.strictEqual(parseByteSize('1KB'), 1000);
    assert.strictEqual(parseByteSize('1kb'), 1000);
    assert.strictEqual(parseByteSize('1KiB'), 1024);
    assert.strictEqual(parseByteSize('1.5 KB'), 1500);
  });

  it('should parse megabytes units', () => {
    assert.strictEqual(parseByteSize('1M'), 1000000);
    assert.strictEqual(parseByteSize('1m'), 1000000);
    assert.strictEqual(parseByteSize('1MB'), 1000000);
    assert.strictEqual(parseByteSize('1mb'), 1000000);
    assert.strictEqual(parseByteSize('1MiB'), 1048576);
    assert.strictEqual(parseByteSize('2.5MB'), 2500000);
  });

  it('should parse gigabytes units', () => {
    assert.strictEqual(parseByteSize('1G'), 1000000000);
    assert.strictEqual(parseByteSize('1g'), 1000000000);
    assert.strictEqual(parseByteSize('1GB'), 1000000000);
    assert.strictEqual(parseByteSize('1gb'), 1000000000);
    assert.strictEqual(parseByteSize('1GiB'), 1073741824);
    assert.strictEqual(parseByteSize('0.5GB'), 500000000);
  });

  it('should parse terabytes units', () => {
    assert.strictEqual(parseByteSize('1T'), 1000000000000);
    assert.strictEqual(parseByteSize('1TB'), 1000000000000);
    assert.strictEqual(parseByteSize('1TiB'), 1099511627776);
  });

  it('should throw for invalid inputs', () => {
    assert.throws(() => parseByteSize(''), /Invalid byte size/);
    assert.throws(() => parseByteSize('   '), /Invalid byte size/);
    assert.throws(() => parseByteSize('abc'), /Invalid byte size/);
    assert.throws(() => parseByteSize('10XYZ'), /Unknown unit/);
    assert.throws(() => parseByteSize('-10MB'), /Invalid byte size/);
    assert.throws(() => parseByteSize(`${'9'.repeat(300)}TB`), /Invalid byte/);
  });

  it('should parse inclusive byte-size ranges', () => {
    assert.deepStrictEqual(parseByteSizeRange('10M'), {
      min: 10 * 1000 * 1000,
      max: undefined,
    });
    assert.deepStrictEqual(parseByteSizeRange('1KB-2MiB'), {
      min: 1000,
      max: 2 * 1024 * 1024,
    });
    assert.deepStrictEqual(parseByteSizeRange('-1MB'), {
      min: 0,
      max: 1000 * 1000,
    });
    assert.deepStrictEqual(parseByteSizeRange('1MiB-'), {
      min: 1024 * 1024,
      max: undefined,
    });
    assert.deepStrictEqual(parseByteSizeRange(' 1 KB - 2 MB '), {
      min: 1000,
      max: 2 * 1000 * 1000,
    });
  });

  it('should reject invalid byte-size ranges', () => {
    assert.throws(() => parseByteSizeRange(''), /Invalid byte size/);
    assert.throws(() => parseByteSizeRange('-'), /At least one bound/);
    assert.throws(() => parseByteSizeRange('2MB-1MB'), /lower bound/);
    assert.throws(() => parseByteSizeRange('1MB-2MB-3MB'), /Invalid byte/);
    assert.throws(() => parseByteSizeRange('invalid-1MB'), /Invalid byte/);
  });
});

describe('byteSizeRangeSchema', () => {
  it('parses valid byte-size range string', () => {
    const schema = byteSizeRangeSchema('test');
    const result = schema.safeParse('1KB-2MB');
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.deepStrictEqual(result.data, {
        min: 1000,
        max: 2 * 1000 * 1000,
      });
    }
  });

  it('fails for invalid byte-size range string', () => {
    const schema = byteSizeRangeSchema('test');
    const result = schema.safeParse('2MB-1MB');
    assert.strictEqual(result.success, false);
  });
});
