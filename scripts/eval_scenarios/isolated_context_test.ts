/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Create a new page <TEST_URL> in an isolated context called contextB. Take a screenshot there.',
  maxTurns: 3,
  htmlRoute: {
    path: '/test.html',
    htmlContent: `
      <h1>test</h1>
    `,
  },
  expectations: calls => {
    console.log(JSON.stringify(calls, null, 2));
    assert.strictEqual(calls.length, 2);
    assert.ok(calls[0].name === 'new_page', 'First call should be navigation');
    assert.deepStrictEqual(calls[0].args.isolatedContext, 'contextB');
    assert.ok(
      calls[1].name === 'take_screenshot',
      'Second call should be a screenshot',
    );
  },
};
