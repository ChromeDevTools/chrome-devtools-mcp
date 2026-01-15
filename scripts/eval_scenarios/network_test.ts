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
    const navigate = calls.find(
      c => c.name === 'navigate_page' || c.name === 'new_page',
    );
    const listRequests = calls.find(c => c.name === 'list_network_requests');

    assert.ok(navigate, 'Should navigate to the page');
    assert.ok(listRequests, 'Should list network requests');
  },
};
