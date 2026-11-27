/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Navigate to <TEST_URL>, inspect the DevTools issues in the console, and tell me which issues were found and the exact modern-web-guidance command to retrieve implementation help.',
  maxTurns: 5,
  htmlRoute: {
    path: '/console_issue_mwg_test.html',
    htmlContent: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'">
          <title>DevTools Issues MWG Test</title>
        </head>
        <body>
          <form>
            <input type="text" name="username">
          </form>
          <div id="target"></div>
          <script>
            document.getElementById('target').innerHTML = '<span>unsafe sink</span>';
          </script>
        </body>
      </html>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    const listCall = result.calls.find(c => c.name === 'list_console_messages');
    assert.ok(listCall, 'Expected list_console_messages to be called');
    if (result.hasPageIdRouting && pageId !== undefined) {
      assert.strictEqual(listCall.args.pageId, pageId);
    }
    result.assertTextIncludes(
      'modern-web-guidance',
      'retrieve',
      'mitigate-dom-xss-trusted-types',
      'autofill-sign-up-form',
    );
  },
};
