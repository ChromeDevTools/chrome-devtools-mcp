/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Open the website at <TEST_URL> and replace the script named my-third-party.js with the script hosted at https://www.examplescripts.agi/another.js.',
  maxTurns: 4,
  htmlRoute: {
    path: '/network_override_redirect_test.html',
    htmlContent: `
      <h1>Redirect network override test</h1>
      <script src="/my-third-party.js"></script>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    const overrideCall = result.remainingCalls.find(
      call => call.name === 'add_network_override',
    );
    assert.ok(
      overrideCall,
      `Expected add_network_override after navigation, got: ${result.remainingCalls.map(call => call.name).join(', ')}`,
    );
    assert.strictEqual(overrideCall.args.urlPattern, '*my-third-party.js*');
    assert.strictEqual(overrideCall.args.resourceType, 'script');
    assert.strictEqual(
      overrideCall.args.redirectUrl,
      'https://www.examplescripts.agi/another.js',
    );
    assert.strictEqual(overrideCall.args.responseFilePath, undefined);
    if (result.hasPageIdRouting) {
      assert.strictEqual(overrideCall.args.pageId, pageId);
    }
  },
};
