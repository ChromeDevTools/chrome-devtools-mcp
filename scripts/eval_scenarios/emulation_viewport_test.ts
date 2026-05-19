/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Emulate current page with iPhone 14 viewport',
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
      viewport: '390x844x3,mobile,touch',
      pageId: result.hasPageIdRouting ? 1 : undefined,
    });
  },
};
