/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eval scenario: an inline `style` attribute overrides stylesheet rules.
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

/**
 * uids that resolve to `span#badge`: the `StaticText "New"` node in the default
 * snapshot, or the element itself once a verbose snapshot reveals it.
 */
const BADGE_UIDS = ['1_1', '2_2'];

export const scenario: TestScenario = {
  prompt: `On <TEST_URL> the New badge should be purple according to my stylesheet, but it renders green. What is overriding my rule?`,
  maxTurns: 6,
  htmlRoute: {
    path: '/css_inline.html',
    htmlContent: `
      <style>
        #badge.badge { color: purple; font-size: 20px; }
        .badge { color: navy; }
      </style>
      <span class="badge" id="badge" style="color: green; font-size: 30px;">New</span>
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
      assert.ok(
        BADGE_UIDS.includes(String(call.args.uid)),
        `get_css_styles should inspect the New badge (${BADGE_UIDS.join(' or ')}), got ${call.args.uid}`,
      );
    }

    // The losing rule must be identified, and the winner named as the inline style.
    result.assertTextIncludes('#badge', 'element.style', 'inline style');
  },
};
