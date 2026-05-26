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
  expectations: result => {
    assert.ok(result.remainingCalls.length >= 1);
    result.assertNextCall('list_pages');
    result.assertNextCall('emulate', {
      networkConditions: 'Offline',
      pageId: result.hasPageIdRouting ? 1 : undefined,
    });
  },
};
