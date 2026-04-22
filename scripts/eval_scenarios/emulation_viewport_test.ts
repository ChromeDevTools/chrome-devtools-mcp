/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Emulate iPhone 14 viewport',
  maxTurns: 2,
  expectations: calls => {
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'emulate');
    assert.deepStrictEqual(calls[0].args.viewport, '390x844x3,mobile,touch');
  },
};
