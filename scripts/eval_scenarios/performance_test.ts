/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Check the performance of https://developers.chrome.com',
  maxTurns: 2,
  expectations: calls => {
    assert.strictEqual(calls.length, 2);
    assert.ok(
      calls[0].name === 'navigate_page' || calls[0].name === 'new_page',
    );
    assert.ok(calls[1].name === 'performance_start_trace');
  },
};
