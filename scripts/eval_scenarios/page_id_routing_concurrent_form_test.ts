/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

const PAGE_A_URL =
  'data:text/html,<form id="login-form"><input type="text" id="username" placeholder="Username" /><input type="password" id="password" placeholder="Password" /><button type="submit" id="submit-login">Log In</button></form>';
const PAGE_B_URL =
  'data:text/html,<form id="feedback-form"><input type="text" id="email" placeholder="Email" /><textarea id="comments" placeholder="Comments"></textarea><button type="submit" id="submit-feedback">Send</button></form>';

export const scenario: TestScenario = {
  prompt: `Open two new pages in isolated contexts:
- Page A (isolatedContext "login_ctx") at ${PAGE_A_URL}
- Page B (isolatedContext "feedback_ctx") at ${PAGE_B_URL}

Take a snapshot of both pages. Then, perform the following actions individually in the exact order specified below:
1. Fill "admin" into the Username input on Page A.
2. Fill "user@example.com" into the Email input on Page B.
3. Fill "secret123" into the Password input on Page A.
4. Fill "Great tools!" into the Comments textarea on Page B.

Finally, submit both forms by clicking the submit buttons on Page A and Page B.`,
  maxTurns: 15,
  expectations: result => {
    const newPages = result.calls.filter(c => c.name === 'new_page');
    assert.strictEqual(newPages.length, 2, 'Should open 2 pages');
    const snapshots = result.calls.filter(c => c.name === 'take_snapshot');
    assert.ok(snapshots.length >= 2, 'Should snapshot both pages');

    const fills = result.calls.filter(c => c.name === 'fill');
    assert.strictEqual(
      fills.length,
      4,
      'Should fill 4 inputs across the forms',
    );

    // Verify that each fill targeted the correct pageId based on its value/element
    for (const fill of fills) {
      const value = String(fill.args['value'] || '');
      if (value === 'admin' || value === 'secret123') {
        assert.strictEqual(
          fill.args['pageId'],
          2,
          `Filling '${value}' should target login page (pageId 2)`,
        );
      } else if (value === 'user@example.com' || value === 'Great tools!') {
        assert.strictEqual(
          fill.args['pageId'],
          3,
          `Filling '${value}' should target feedback page (pageId 3)`,
        );
      } else {
        assert.fail(`Unexpected fill value: ${value}`);
      }
    }

    // Verify no select_page calls were made between the interleaved actions
    const selects = result.calls.filter(c => c.name === 'select_page');
    assert.strictEqual(
      selects.length,
      0,
      'Should not use select_page when pageId routing is active',
    );
  },
};
