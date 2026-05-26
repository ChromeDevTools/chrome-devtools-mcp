/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Go to <TEST_URL>, fill the input with "hello world" and click the button five times in parallel without using a script.',
  maxTurns: 10,
  htmlRoute: {
    path: '/input_test.html',
    htmlContent: `
      <input type="text" id="test-input" />
      <button id="test-button">Submit</button>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 7);
    result.assertNextCall(
      'take_snapshot',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
    result.assertNextCall(
      'fill',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
    for (let i = 2; i < 7; i++) {
      result.assertNextCall('click', {
        includeSnapshot: undefined,
        pageId: result.hasPageIdRouting ? pageId : undefined,
      });
    }
  },
};
