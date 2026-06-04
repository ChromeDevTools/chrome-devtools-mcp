/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Open new page <TEST_URL> and then open new page https://developers.chrome.com. Select the <TEST_URL> page.',
  maxTurns: 3,
  htmlRoute: {
    path: '/test.html',
    htmlContent: `
      <h1>test</h1>
    `,
  },
  expectations: result => {
    result.consumePageNavigation();
    assert.strictEqual(result.remainingCalls.length, 2);
    result.assertNextCall('new_page');
    result.assertNextCall('select_page', {pageId: 2, bringToFront: undefined});
  },
};
