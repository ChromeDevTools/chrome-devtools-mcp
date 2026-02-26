/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  serverArgs: ['--experimental-page-id-routing'],
  prompt: `Open two new pages in isolated contexts:
- Page A (isolatedContext "contextA") at data:text/html,<button>Click A</button>
- Page B (isolatedContext "contextB") at data:text/html,<button>Click B</button>
Then take a snapshot of Page A, take a snapshot of Page B, and then click the button on Page A.`,
  maxTurns: 12,
  expectations: calls => {
    // Should have 2 new_page calls with isolatedContext.
    const newPages = calls.filter(c => c.name === 'new_page');
    assert.strictEqual(newPages.length, 2, 'Should open 2 pages');
    for (const np of newPages) {
      assert.strictEqual(
        typeof np.args.isolatedContext,
        'string',
        'new_page should use isolatedContext',
      );
    }

    // Should have at least 2 take_snapshot calls (one per page).
    // The model may use pageId directly or select_page before each snapshot.
    const snapshots = calls.filter(c => c.name === 'take_snapshot');
    assert.ok(snapshots.length >= 2, 'Should take at least 2 snapshots');

    // Should have a click call (resolving uid from Page A's snapshot
    // even though Page B was snapshotted after).
    const clicks = calls.filter(c => c.name === 'click');
    assert.ok(clicks.length >= 1, 'Should click the button on Page A');
  },
};
