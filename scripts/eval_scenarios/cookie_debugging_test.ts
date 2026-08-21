/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.js';

export const scenario: TestScenario = {
  prompt:
    'Navigate to <TEST_URL> and inspect the network request headers to diagnose the authentication failure.',
  maxTurns: 5,
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
    result.consumePageNavigation();
    const listRequestsCall = result.calls.find(
      c => c.name === 'list_network_requests',
    );
    assert.ok(listRequestsCall, 'Expected list_network_requests to be called');
    const getRequestCall = result.calls.find(
      c => c.name === 'get_network_request',
    );
    assert.ok(
      getRequestCall,
      'Expected get_network_request to be called to inspect headers',
    );
  },
};
