/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eval scenario: resolving a CSS custom property through inheritance.
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

/**
 * uids that resolve to `span#label`: the `StaticText "Label"` node in the
 * default snapshot, or the element itself once a verbose snapshot reveals it.
 */
const LABEL_UIDS = ['1_1', '2_3'];

export const scenario: TestScenario = {
  prompt: `The Label text on <TEST_URL> renders red, even though I set my brand color to blue at the root. Where is the red coming from?`,
  maxTurns: 6,
  htmlRoute: {
    path: '/css_custom_props.html',
    htmlContent: `
      <style>
        @property --gap {
          syntax: '<length>';
          inherits: true;
          initial-value: 4px;
        }
        :root { --brand: #00aaff; --gap: 16px; }
        .panel { --brand: #ff0000; }
        .panel .label { color: var(--brand); padding: var(--gap); }
      </style>
      <div class="panel"><span class="label" id="label">Label</span></div>
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
        LABEL_UIDS.includes(String(call.args.uid)),
        `get_css_styles should inspect the Label span (${LABEL_UIDS.join(' or ')}), got ${call.args.uid}`,
      );
    }

    // The overriding definition and its value, neither of which is in the prompt.
    result.assertTextIncludes('.panel', '#ff0000', 'custom property');
  },
};
