/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Navigate to <TEST_URL> and check the console messages.',
  maxTurns: 2,
  htmlRoute: {
    path: '/console_test.html',
    htmlContent: `
      <script>
        console.log('Test log message');
        console.error('Test error message');
      </script>
    `,
  },
  expectations: calls => {
    assert.strictEqual(calls.length, 2);
    assert.ok(
      calls[0].name === 'navigate_page' || calls[0].name === 'new_page',
      'First call should be navigation',
    );
    assert.strictEqual(
      calls[1].name,
      'list_console_messages',
      'Second call should be list_console_messages',
    );
  },
};
