/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Emulate offline network conditions.',
  maxTurns: 2,
  expectations: calls => {
    const emulate = calls.find(c => c.name === 'emulate');
    assert.ok(emulate, 'Should call emulate tool');
    assert.strictEqual(emulate.args.networkConditions, 'Offline');
  },
};
