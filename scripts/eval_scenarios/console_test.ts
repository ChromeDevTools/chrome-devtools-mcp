/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Navigate to <TEST_URL> and check the console messages.',
  maxTurns: 3,
  htmlRoute: {
    path: '/console_test.html',
    htmlContent: `
      <script>
        console.log('Test log message');
        console.error('Test error message');
      </script>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.strictEqual(result.remainingCalls.length, 1);
    result.assertNextCall(
      'list_console_messages',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
  },
};
