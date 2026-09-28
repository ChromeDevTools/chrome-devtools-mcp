/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eval scenario: specificity of long descendant selector chains.
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

/**
 * uid of `a#deeplink` (`1_2`) or of its `StaticText` child (`1_3`): a text node
 * uid resolves to its parent element, so both target the link.
 */
const LINK_UIDS = ['1_2', '1_3'];

export const scenario: TestScenario = {
  prompt: `The Deep link on <TEST_URL> shows up purple, but I have a rule that should make it teal. Why isn't my rule applying?`,
  maxTurns: 6,
  htmlRoute: {
    path: '/css_descendant.html',
    htmlContent: `
      <style>
        main .content .list .item a { color: teal; }
        .list a { color: olive; }
        #sidebar a { color: maroon; }
        html body main .content .list .item.active a { color: rebeccapurple; }
      </style>
      <main>
        <div class="content">
          <ul class="list">
            <li class="item active"><a id="deeplink" href="#">Deep link</a></li>
          </ul>
        </div>
      </main>
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
        LINK_UIDS.includes(String(call.args.uid)),
        `get_css_styles should inspect the Deep link (${LINK_UIDS.join(' or ')}), got ${call.args.uid}`,
      );
    }

    // The winning selector and the reason, neither of which is in the prompt.
    result.assertTextIncludes('.item.active', 'specificity');
  },
};
