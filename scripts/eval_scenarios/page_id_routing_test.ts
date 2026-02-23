/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: `Open three new pages in isolated contexts:
- Page A at data:text/html,<h1>Page A</h1>
- Page B at data:text/html,<h1>Page B</h1>
- Page C at data:text/html,<h1>Page C</h1>
Then take screenshots of all three pages in parallel.`,
  maxTurns: 8,
  expectations: calls => {
    // Exactly 3 screenshot calls.
    const screenshots = calls.filter(c => c.name === 'take_screenshot');
    assert.strictEqual(screenshots.length, 3, 'Should take 3 screenshots');

    // Each screenshot must carry a numeric pageId.
    for (const ss of screenshots) {
      assert.strictEqual(
        typeof ss.args.pageId,
        'number',
        'Screenshot should use pageId',
      );
    }

    // All pageIds should be distinct (one per page).
    const pageIds = new Set(screenshots.map(s => s.args.pageId));
    assert.strictEqual(
      pageIds.size,
      3,
      'Each screenshot should target a different page',
    );
  },
};
