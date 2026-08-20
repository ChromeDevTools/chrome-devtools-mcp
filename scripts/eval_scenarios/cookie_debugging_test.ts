/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Navigate to <TEST_URL> and inspect the network request headers to diagnose the authentication failure.',
  maxTurns: 4,
  htmlRoute: {
    path: '/cookie_auth_test.html',
    htmlContent: `
      <h1>Authentication Test</h1>
      <script>
        fetch('/api/user', {
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
      </script>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 2);
    result.assertNextCall(
      'list_network_requests',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
    result.assertNextCall(
      'get_network_request',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
  },
};
