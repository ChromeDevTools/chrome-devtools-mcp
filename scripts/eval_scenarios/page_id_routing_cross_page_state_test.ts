/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type { TestScenario } from '../eval_gemini.ts';

const PAGE_COUNTER =
  'data:text/html,<h1>Counter Page</h1><button id="inc-btn" onclick="document.getElementById(\'count\').innerText = parseInt(document.getElementById(\'count\').innerText) + 1">Increment</button><div id="count">0</div>';
const PAGE_INPUT =
  'data:text/html,<h1>Input Page</h1><label for="val-input">Enter Counter Value:</label><input type="text" id="val-input" /><button id="submit-btn">Submit</button>';

export const scenario: TestScenario = {
  prompt: `Open two new pages:
- Page A at ${PAGE_COUNTER}
- Page B at ${PAGE_INPUT}

Take snapshot of both pages and then perform the following steps:
1. Click the "Increment" button on Page A twice.
2. Take a snapshot of Page A to read the updated counter value.
3. On Page B, fill that exact counter value into the input field, and click the "Submit" button.`,
  maxTurns: 12,
  expectations: result => {
    const newPages = result.calls.filter(c => c.name === 'new_page');
    assert.strictEqual(newPages.length, 2, 'Should open 2 pages');

    const clicks = result.calls.filter(c => c.name === 'click');
    assert.ok(
      clicks.length >= 3,
      'Should click increment twice and then submit',
    );

    // First click and second click should target the increment button on Page A
    const counterClicks = clicks.filter(c => c.args['pageId'] === 2);
    assert.strictEqual(
      counterClicks.length,
      2,
      'Should click increment button on Page A exactly twice',
    );

    // There should be a snapshot of Page A to read the value
    const snapshots = result.calls.filter(c => c.name === 'take_snapshot');
    const counterSnapshot = snapshots.find(s => s.args['pageId'] === 2);
    assert.ok(
      counterSnapshot,
      'Should snapshot Page A to read the counter value',
    );

    // The fill and final click should target Page B
    const fills = result.calls.filter(
      c => c.name === 'fill' || c.name === 'fill_form',
    );
    assert.strictEqual(
      fills.length,
      1,
      'Should fill the input field on Page B',
    );
    assert.strictEqual(fills[0].args['pageId'], 3, 'Fill should target Page B');

    let filledValue = '';
    if (fills[0].name === 'fill_form') {
      const elements = fills[0].args['elements'];
      assert.ok(Array.isArray(elements), 'elements should be an array');
      filledValue = elements[0]['value'];
    } else if (fills[0].name === 'fill') {
      filledValue = String(fills[0].args['value']);
    }

    assert.strictEqual(
      filledValue,
      '2',
      'Should fill the value "2" (since we incremented twice)',
    );

    const finalClick = clicks[clicks.length - 1];
    assert.strictEqual(
      finalClick.args['pageId'],
      3,
      'Submit click should target Page B',
    );

    // Verify no select_page calls were made between the interleaved actions
    const selects = result.calls.filter(c => c.name === 'select_page');
    assert.strictEqual(
      selects.length,
      0,
      'Should not use select_page when pageId routing is active',
    );
  },
};
