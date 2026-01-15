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
    const navigate = calls.find(
      c => c.name === 'navigate_page' || c.name === 'new_page',
    );
    const listMessages = calls.find(c => c.name === 'list_console_messages');

    assert.ok(navigate, 'Should navigate to the page');
    assert.ok(listMessages, 'Should list console messages');
  },
};
