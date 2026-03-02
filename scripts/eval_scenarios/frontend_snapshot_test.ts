/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eval scenario using "website"/"webpage" wording to verify the model invokes
 * the right tools when users ask to open a site and read its content.
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Open the website at <TEST_URL> and tell me what content is on the page.',
  maxTurns: 3,
  htmlRoute: {
    path: '/frontend_snapshot.html',
    htmlContent: '<h1>Frontend Test</h1><p>This is a test webpage.</p>',
  },
  expectations: calls => {
    assert.strictEqual(calls.length, 2);
    assert.ok(
      calls[0].name === 'navigate_page' || calls[0].name === 'new_page',
      'First call should be navigation',
    );
    assert.strictEqual(
      calls[1].name,
      'take_snapshot',
      'Second call should be take_snapshot to read page content',
    );
  },
};
