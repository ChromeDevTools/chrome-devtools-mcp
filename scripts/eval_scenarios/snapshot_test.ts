/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Read the content of <TEST_URL>',
  maxTurns: 3,
  htmlRoute: {
    path: '/test.html',
    htmlContent: '<h1>Hello World</h1><p>This is a test.</p>',
  },
  expectations: calls => {
    assert.strictEqual(calls.length, 2);
    assert.ok(
      calls[0].name === 'navigate_page' || calls[0].name === 'new_page',
    );
    assert.ok(calls[1].name === 'take_snapshot');
  },
};
