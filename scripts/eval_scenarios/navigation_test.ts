/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Navigate to https://developers.chrome.com and tell me if it worked.',
  maxTurns: 1,
  expectations: calls => {
    assert.deepStrictEqual(calls, [
      {
        name: 'navigate_page',
        args: {url: 'https://developers.chrome.com'},
      },
    ]);
  },
};
