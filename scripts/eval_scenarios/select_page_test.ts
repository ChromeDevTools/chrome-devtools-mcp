/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Open new page <TEST_URL> and then open new page https://developers.chrome.com. Select the <TEST_URL> page.',
  maxTurns: 3,
  htmlRoute: {
    path: '/test.html',
    htmlContent: `
      <h1>test</h1>
    `,
  },
  expectations: calls => {
    assert.strictEqual(calls.length, 3);
    assert.ok(calls[0].name === 'new_page', 'First call should be navigation');
    assert.ok(calls[1].name === 'new_page', 'Second call should be navigation');
    assert.ok(
      calls[2].name === 'select_page',
      'Third call should be select_page',
    );
    assert.strictEqual(
      calls[2].args.pageId,
      2,
      'PageId has to be set to 2. about:blank is 1, <TEST_URL> is 2, https://developers.chrome.com is 3.',
    );
    assert.strictEqual(
      calls[2].args.bringToFront,
      undefined,
      'bringToFront should use the default value.',
    );
  },
};
