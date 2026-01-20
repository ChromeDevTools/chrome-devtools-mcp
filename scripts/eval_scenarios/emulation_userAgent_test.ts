/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Emulate iPhone 14 user agent',
  maxTurns: 2,
  expectations: calls => {
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'emulate');
    assert.deepStrictEqual(
      calls[0].args.userAgent,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    );
  },
};
