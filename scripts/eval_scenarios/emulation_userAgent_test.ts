/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Emulate current page with iPhone 14 user agent',
  maxTurns: 2,
  expectations: result => {
    assert.ok(result.remainingCalls.length >= 1);
    if (
      result.hasPageIdRouting ||
      result.remainingCalls[0]?.name === 'list_pages'
    ) {
      result.assertNextCall('list_pages');
    }
    result.assertNextCall('emulate', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      pageId: result.hasPageIdRouting ? 1 : undefined,
    });
  },
};
