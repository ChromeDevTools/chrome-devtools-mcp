/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Read the content of <TEST_URL>',
  maxTurns: 4,
  htmlRoute: {
    path: '/test.html',
    htmlContent: '<h1>Hello World</h1><p>This is a test.</p>',
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.strictEqual(result.remainingCalls.length, 1);
    result.assertNextCall(
      'take_snapshot',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
  },
};
