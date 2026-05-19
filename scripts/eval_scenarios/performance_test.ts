/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Check the performance of https://developers.chrome.com',
  maxTurns: 3,
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 1);
    result.assertNextCall(
      'performance_start_trace',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
  },
};
