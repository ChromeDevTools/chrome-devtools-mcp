/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseDurationMs} from '../../src/utils/duration.js';

describe('parseDurationMs', () => {
  const validCases: Array<[string, number]> = [
    ['90s', 90_000],
    ['30m', 1_800_000],
    ['2h', 7_200_000],
    ['2147483s', 2_147_483_000],
    ['35791m', 2_147_460_000],
    ['596h', 2_145_600_000],
  ];
  for (const [value, expected] of validCases) {
    it(`parses ${value}`, () => {
      assert.strictEqual(parseDurationMs('idleTimeout', value), expected);
    });
  }

  for (const value of [
    '',
    '30',
    '0s',
    '-1m',
    '1.5h',
    '30d',
    '30ms',
    '30M',
    ' 30m',
    '30m ',
    30,
    ['30s'],
  ]) {
    it(`rejects the format ${JSON.stringify(value)}`, () => {
      assert.throws(
        () => parseDurationMs('idleTimeout', value),
        new Error(
          `Invalid idleTimeout ${JSON.stringify(value)}. Expected a positive integer followed by s, m or h, for example 90s, 30m or 2h.`,
        ),
      );
    });
  }

  for (const value of ['2147484s', '35792m', '597h']) {
    it(`rejects ${value} above the setTimeout limit`, () => {
      assert.throws(
        () => parseDurationMs('idleTimeout', value),
        new Error(
          `Invalid idleTimeout ${JSON.stringify(value)}. Expected at most 2147483647 ms (about 596h).`,
        ),
      );
    });
  }
});
