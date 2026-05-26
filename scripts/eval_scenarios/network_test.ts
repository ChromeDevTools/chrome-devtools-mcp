/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Navigate to <TEST_URL> and list all network requests.',
  maxTurns: 3,
  htmlRoute: {
    path: '/network_test.html',
    htmlContent: `
      <h1>Network Test</h1>
      <script>
        fetch('/network_test.html'); // Self fetch to ensure at least one request
      </script>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 1);
    result.assertNextCall(
      'list_network_requests',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
  },
};
