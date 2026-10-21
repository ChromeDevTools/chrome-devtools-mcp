/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Run a Lighthouse audit on <TEST_URL> and tell me which failing audits were found and the exact modern-web-guidance command to retrieve implementation help.',
  maxTurns: 4,
  htmlRoute: {
    path: '/lighthouse_mwg_test.html',
    htmlContent: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>MWG Lighthouse Test</title>
        </head>
        <body>
          <main>
            <h1>MWG Lighthouse Test</h1>
            <p style="color: rgb(238, 238, 238); background: rgb(255, 255, 255)">
              Low contrast text
            </p>
            <input type="text">
          </main>
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
    result.assertTextIncludes(
      'modern-web-guidance',
      'retrieve',
      'ensure-sufficient-color-contrast',
    );
  },
};
