/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.js';

export const scenario: TestScenario = {
  prompt:
    'Reload the page <TEST_URL> and inspect the network request headers to view the active HttpOnly cookie.',
  maxTurns: 4,
  htmlRoute: {
    path: '/cookie_httponly_test.html',
    htmlContent: `
      <h1>HttpOnly Session Test</h1>
    `,
  },
  expectations: result => {
    result.consumePageNavigation();
    const getRequestCall = result.calls.find(
      c => c.name === 'get_network_request',
    );
    assert.ok(
      getRequestCall,
      'Expected get_network_request to be called to inspect HttpOnly headers',
    );
  },
};
