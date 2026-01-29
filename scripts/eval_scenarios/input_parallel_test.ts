/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Go to <TEST_URL>, fill the input with "hello world" and click the button five times in parallel.',
  maxTurns: 10,
  htmlRoute: {
    path: '/input_test.html',
    htmlContent: `
      <input type="text" id="test-input" />
      <button id="test-button">Submit</button>
    `,
  },
  expectations: calls => {
    assert.strictEqual(calls.length, 8);
    assert.ok(
      calls[0].name === 'navigate_page' || calls[0].name === 'new_page',
    );
    assert.ok(calls[1].name === 'take_snapshot');
    assert.ok(calls[2].name === 'fill');
    for (let i = 3; i < 8; i++) {
      assert.ok(calls[i].name === 'click');
      assert.strictEqual(Boolean(calls[i].args.includeSnapshot), false);
    }
  },
};
