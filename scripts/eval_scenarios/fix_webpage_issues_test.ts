/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eval scenario: user asks to fix issues with their webpage (no URL given).
 * When no URL is provided, the model should pick the current frontend and run
 * and inspect it. Verifies the MCP server is invoked and the model opens the
 * frontend and inspects it (snapshot, console, or network).
 *
 * Note: Tools like performance_start_trace, take_snapshot, list_console_messages,
 * and list_network_requests do not require a URL in the prompt—they operate on
 * the currently selected page. Only navigate_page/new_page need a URL to open
 * a page; the eval runner injects the test URL when htmlRoute is set.
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

const INSPECTION_TOOLS = [
  'take_snapshot',
  'list_console_messages',
  'list_network_requests',
];

export const scenario: TestScenario = {
  prompt: 'Can you fix issues with my webpage?',
  maxTurns: 4,
  htmlRoute: {
    path: '/fix_issues_test.html',
    htmlContent: `
      <h1>Test Page</h1>
      <p>Some content</p>
      <script>
        console.error('Intentional error for testing');
      </script>
    `,
  },
  expectations: calls => {
    const NAVIGATION_TOOLS = ['navigate_page', 'new_page'];
    assert.ok(calls.length >= 2, 'Expected at least navigation and one inspection');
    const navigationIndex = calls.findIndex(c => NAVIGATION_TOOLS.includes(c.name));
    assert.ok(
      navigationIndex !== -1,
      `Expected a navigation call (${NAVIGATION_TOOLS.join(' or ')}), got: ${calls.map(c => c.name).join(', ')}`,
    );
    const afterNavigation = calls.slice(navigationIndex + 1);
    const inspectionCalls = afterNavigation.filter(c =>
      INSPECTION_TOOLS.includes(c.name),
    );
    assert.ok(
      inspectionCalls.length >= 1,
      `Expected at least one inspection tool (${INSPECTION_TOOLS.join(', ')}) after navigation, got: ${calls.map(c => c.name).join(', ')}`,
    );
  },
};
