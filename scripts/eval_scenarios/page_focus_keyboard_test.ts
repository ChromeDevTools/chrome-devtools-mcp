/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  serverArgs: ['--experimental-page-id-routing'],
  prompt: `Open two pages in the same isolated context "session":
- Page 1 at data:text/html,<textarea id="ta"></textarea>
- Page 2 at data:text/html,<h1>Other</h1>

Now use the press_key tool to type "a" on Page 1 without selecting it first. You must use press_key, not fill or type_text. If you encounter any errors, recover from them.`,
  maxTurns: 10,
  expectations: calls => {
    // Should open 2 pages in the same context.
    const newPages = calls.filter(c => c.name === 'new_page');
    assert.strictEqual(newPages.length, 2, 'Should open 2 pages');
    assert.strictEqual(newPages[0].args.isolatedContext, 'session');
    assert.strictEqual(newPages[1].args.isolatedContext, 'session');

    // Should attempt press_key at least once.
    const pressKeys = calls.filter(c => c.name === 'press_key');
    assert.ok(pressKeys.length >= 1, 'Should attempt press_key at least once');

    const selectPages = calls.filter(c => c.name === 'select_page');

    if (selectPages.length > 0) {
      const firstPressKeyIndex = calls.indexOf(pressKeys[0]);
      const firstSelectPageIndex = calls.indexOf(selectPages[0]);

      if (firstPressKeyIndex < firstSelectPageIndex) {
        // Error path: press_key was attempted first and failed.
        // Verify recovery: must have a second press_key after select_page.
        assert.ok(
          pressKeys.length >= 2,
          'Should retry press_key after error recovery',
        );
        const lastPressKeyIndex = calls.lastIndexOf(pressKeys.at(-1)!);
        assert.ok(
          firstSelectPageIndex < lastPressKeyIndex,
          'select_page should precede the successful press_key',
        );
      } else {
        // Proactive path: model selected page first.
        assert.ok(
          firstSelectPageIndex < firstPressKeyIndex,
          'select_page should precede press_key',
        );
      }
    }
    // If no select_page was called, the model found another recovery path.
    // This is acceptable as long as press_key was attempted.
  },
};
