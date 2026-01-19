/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Go to <TEST_URL>, fill the input with "hello world" and click the button.',
  maxTurns: 3,
  htmlRoute: {
    path: '/input_test.html',
    htmlContent: `
      <input type="text" id="test-input" />
      <button id="test-button">Submit</button>
    `,
  },
  expectations: calls => {
    // Expected sequence: navigate -> fill -> click
    // But model might take snapshot in between or do things in parallel if supported (but standard loop is sequential turns usually)
    // We just check if the tools were called.

    const navigate = calls.find(
      c => c.name === 'navigate_page' || c.name === 'new_page',
    );
    const fill = calls.find(c => c.name === 'fill');
    const click = calls.find(c => c.name === 'click');

    assert.ok(navigate, 'Should navigate to the page');
    assert.ok(fill, 'Should fill the input');
    assert.ok(click, 'Should click the button');

    assert.strictEqual(fill.args.value, 'hello world');
  },
};
