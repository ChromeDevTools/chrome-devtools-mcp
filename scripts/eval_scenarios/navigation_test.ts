/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Navigate in current page to https://developers.chrome.com and tell me if it worked.',
  maxTurns: 2,
  expectations: result => {
    if (result.hasPageIdRouting) {
      result.assertNextCall('list_pages');
    }
    assert.ok(result.remainingCalls.length >= 1);
    result.assertNextCall('navigate_page', {
      url: 'https://developers.chrome.com',
      pageId: result.hasPageIdRouting ? 1 : undefined,
    });
  },
};
