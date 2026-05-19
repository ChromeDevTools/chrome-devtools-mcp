/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Go to <TEST_URL>, fill the input with "hello world" and click the button.',
  maxTurns: 5,
  htmlRoute: {
    path: '/input_test.html',
    htmlContent: `
      <input type="text" id="test-input" />
      <button id="test-button">Submit</button>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 3);
    result.assertNextCall(
      'take_snapshot',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
    result.assertNextCall(
      'fill',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
    result.assertNextCall(
      'click',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
  },
};
