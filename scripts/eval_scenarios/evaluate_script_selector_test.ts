/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Open <TEST_URL>, inspect the page, then use evaluate_script to return the table value next to the "UPC" header.',
  maxTurns: 5,
  htmlRoute: {
    path: '/evaluate_script_selector_test.html',
    htmlContent: `
      <main>
        <h1>Product details</h1>
        <table>
          <tbody>
            <tr><th scope="row">UPC</th><td>123456789012</td></tr>
            <tr><th scope="row">SKU</th><td>SKU-42</td></tr>
          </tbody>
        </table>
      </main>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    const snapshotCall = result.remainingCalls.find(
      call => call.name === 'take_snapshot',
    );
    assert.ok(snapshotCall, 'Expected the model to inspect the page snapshot');

    const evaluateCall = result.remainingCalls.find(
      call => call.name === 'evaluate_script',
    );
    assert.ok(evaluateCall, 'Expected the model to use evaluate_script');

    if (result.hasPageIdRouting) {
      assert.strictEqual(snapshotCall.args.pageId, pageId);
      assert.strictEqual(evaluateCall.args.pageId, pageId);
    }

    const functionArg = evaluateCall.args.function;
    assert.strictEqual(typeof functionArg, 'string');

    assert.ok(
      !/:contains\b/i.test(functionArg),
      `evaluate_script should not use non-standard :contains selectors: ${functionArg}`,
    );
    assert.ok(
      !/\[\s*(?:uid|ref)\s*=/.test(functionArg),
      `evaluate_script should not query snapshot ids as DOM attributes: ${functionArg}`,
    );
  },
};
