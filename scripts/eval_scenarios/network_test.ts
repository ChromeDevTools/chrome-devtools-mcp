/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Navigate to <TEST_URL> and list all network requests.',
  maxTurns: 2,
  htmlRoute: {
    path: '/network_test.html',
    htmlContent: `
      <h1>Network Test</h1>
      <script>
        fetch('/network_test.html'); // Self fetch to ensure at least one request
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
      'list_network_requests',
      'Second call should be list_network_requests',
    );
  },
};
