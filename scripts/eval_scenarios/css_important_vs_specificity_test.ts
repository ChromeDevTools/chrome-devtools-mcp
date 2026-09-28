/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eval scenario: `!important` beats specificity.
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

/** uid of `button#cta` in the first page snapshot. */
const BUTTON_UID = '1_1';

export const scenario: TestScenario = {
  prompt: `The Buy button on <TEST_URL> renders crimson even though I added a rule to set it to navy. Why does this happen?`,
  maxTurns: 6,
  htmlRoute: {
    path: '/css_important.html',
    htmlContent: `
      <style>
        #cta.primary.large { background-color: navy; }
        .btn { background-color: crimson !important; }
        button.btn.primary { background-color: green; }
      </style>
      <button id="cta" class="btn primary large">Buy</button>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    result.assertNextCall(
      'take_snapshot',
      result.hasPageIdRouting ? {pageId} : undefined,
    );

    const cssCalls = result.calls.filter(c => c.name === 'get_css_styles');
    assert.ok(
      cssCalls.length >= 1,
      `Expected get_css_styles to be called, got: ${result.calls.map(c => c.name).join(', ')}`,
    );
    for (const call of cssCalls) {
      assert.strictEqual(
        call.args.uid,
        BUTTON_UID,
        'get_css_styles should inspect the Buy button',
      );
    }

    // The winning rule and the reason it wins, neither of which is in the prompt.
    result.assertTextIncludes('.btn', '!important');
  },
};
