/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eval scenario: a cascade layer losing to an unlayered rule.
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

/**
 * uid of `div#card` (`2_3`) or of its `StaticText` child (`1_1`): a text node
 * uid resolves to its parent element, so both target the card.
 */
const CARD_UIDS = ['1_1', '2_3'];

export const scenario: TestScenario = {
  prompt: `The featured card on <TEST_URL> is stuck at 400px wide even though I set max-width: 900px for it. Why isn't my rule winning? Do not take screenshots.`,
  maxTurns: 10,
  htmlRoute: {
    path: '/css_layer.html',
    htmlContent: `
      <style>
        @layer base, overrides;

        @layer base {
          .card { background: #eef; }
        }

        .layout .card { max-width: 400px; }

        @layer overrides {
          .card.featured { max-width: 900px; }
        }
      </style>
      <div class="layout">
        <div class="card featured" id="card">Featured card</div>
      </div>
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
        CARD_UIDS.includes(String(call.args.uid)),
        `get_css_styles should inspect the featured card (${CARD_UIDS.join(' or ')}), got ${call.args.uid}`,
      );
    }

    // The winning selector and the reason, neither of which is in the prompt.
    result.assertTextIncludes('.layout .card', 'layer');
  },
};
