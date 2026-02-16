/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'I want to make my page fast. Page URL is <TEST_URL>.',
  maxTurns: 2,
  htmlRoute: {
    path: '/index.html',
    htmlContent: `
      <script>for (let i = 0; i < 1000; i++) {console.log("slow");}</script>
    `,
  },
  expectations: calls => {
    assert.strictEqual(calls.length, 2);
    assert.ok(
      calls[0].name === 'navigate_page' || calls[0].name === 'new_page',
    );
    assert.ok(calls[1].name === 'performance_start_trace');
  },
};
