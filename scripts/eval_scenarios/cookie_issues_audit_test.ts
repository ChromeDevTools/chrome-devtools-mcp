/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Navigate to <TEST_URL> and inspect the console issues to check for cookie security or SameSite policy warnings.',
  maxTurns: 3,
  htmlRoute: {
    path: '/cookie_issues_test.html',
    htmlContent: `
      <h1>Cookie Issues Test</h1>
      <p>Testing SameSite and CHIPS issues</p>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 1);
    result.assertNextCall('list_console_messages', {
      types: ['issue'],
      ...(result.hasPageIdRouting ? {pageId} : {}),
    });
  },
};
