/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

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
    assert.ok(result.remainingCalls.length >= 2);
    result.assertNextCall('navigate_page', {
      reload: true,
      ...(result.hasPageIdRouting ? {pageId: 1} : {}),
    });
    result.assertNextCall(
      'get_network_request',
      result.hasPageIdRouting ? {pageId: 1} : undefined,
    );
  },
};
