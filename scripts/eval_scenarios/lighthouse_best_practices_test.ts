/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Check for best practices on the page at <TEST_URL>',
  maxTurns: 3,
  htmlRoute: {
    path: '/lighthouse_test.html',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lighthouse Audit Test</title>
        </head>
        <body>
          <h1>Lighthouse Audit Test</h1>
          <p>This is a valid test page for running audits.</p>
        </body>
      </html>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 1);
    result.assertNextCall(
      'lighthouse_audit',
      result.hasPageIdRouting ? {pageId} : undefined,
    );
  },
};
