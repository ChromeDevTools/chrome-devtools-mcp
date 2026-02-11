/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import type {cliOptions} from '../../src/cli.js';
import {computeFlagUsage} from '../../src/telemetry/flagUtils.js';

describe('computeFlagUsage', () => {
  const mockOptions = {
    boolFlag: {
      type: 'boolean' as const,
      description: 'A boolean flag',
    },
    stringFlag: {
      type: 'string' as const,
      description: 'A string flag',
    },
    enumFlag: {
      type: 'string' as const,
      description: 'An enum flag',
      choices: ['a', 'b'],
    },
    flagWithDefault: {
      type: 'boolean' as const,
      description: 'A flag with a default value',
      default: false,
    },
  } as unknown as typeof cliOptions;

  it('logs boolean flags directly with snake_case keys', () => {
    const args = {boolFlag: true};
    const usage = computeFlagUsage(args, mockOptions);
    assert.equal(usage.bool_flag, true);
  });

  it('logs boolean flags as false when false', () => {
    const args = {boolFlag: false};
    const usage = computeFlagUsage(args, mockOptions);
    assert.equal(usage.bool_flag, false);
  });

  it('logs enum flags as uppercase strings prefixed by snake case flag name', () => {
    const args = {enumFlag: 'a'};
    const usage = computeFlagUsage(args, mockOptions);
    assert.equal(usage.enum_flag, 'ENUM_FLAG_A');
  });

  it('logs other flags as present with snake_case keys', () => {
    const args = {stringFlag: 'value'};
    const usage = computeFlagUsage(args, mockOptions);
    assert.equal(usage.string_flag, undefined);
    assert.equal(usage.string_flag_present, true);
  });

  it('handles undefined/null values', () => {
    const args = {stringFlag: undefined};
    const usage = computeFlagUsage(args, mockOptions);
    assert.equal(usage.string_flag_present, false);
  });

  describe('defaults behavior', () => {
    it('logs presence when default exists and user provides different value', () => {
      // Case 1: Default exists, and a value is provided by the user.
      // default is false, user provides true.
      const args = {flagWithDefault: true};
      const usage = computeFlagUsage(args, mockOptions);
      assert.equal(usage.flag_with_default, true);
      assert.equal(usage.flag_with_default_present, true);
    });

    it('does not log presence when default exists and user provides no value', () => {
      // Case 2a: Default exists, and a value is not provided by the user.
      // Argument parsing would populate with default.
      const args = {flagWithDefault: false};
      const usage = computeFlagUsage(args, mockOptions);
      assert.equal(usage.flag_with_default, false);
      assert.equal(usage.flag_with_default_present, undefined);
    });

    it('does not log presence when default exists and user explicitly provides the default value', () => {
      // Case 2b: User explicitly provides 'false', which matches default.
      const args = {flagWithDefault: false};
      const usage = computeFlagUsage(args, mockOptions);
      assert.equal(usage.flag_with_default, false);
      assert.equal(usage.flag_with_default_present, undefined);
    });

    it('logs presence when no default exists and user provides value', () => {
      // Case 3: No default, user provides value.
      const args = {stringFlag: 'value'};
      const usage = computeFlagUsage(args, mockOptions);
      assert.equal(usage.string_flag_present, true);
    });

    it('logs non-presence when no default exists and user provides no value', () => {
      // Case 4: No default, user provides nothing.
      const args = {};
      const usage = computeFlagUsage(args, mockOptions);
      assert.equal(usage.string_flag_present, false);
    });
  });
});
