/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import {URLPattern} from '../../src/third_party/cli.ts';
import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  serverArgs: ['--categoryNetworkMocks'],
  prompt:
    'Open the website at <TEST_URL> and replace the script named my-third-party.js with the script hosted at https://www.examplescripts.agi/another.js.',
  maxTurns: 4,
  htmlRoute: {
    path: '/network_override_redirect_test.html',
    htmlContent: `
      <h1>Upstream network mock test</h1>
      <script src="/my-third-party.js"></script>
    `,
  },
  expectations: result => {
    const pageId = result.consumePageNavigation();
    const overrideCall = result.remainingCalls.find(
      call => call.name === 'mock_network',
    );
    assert.ok(
      overrideCall,
      `Expected mock_network after navigation, got: ${result.remainingCalls.map(call => call.name).join(', ')}`,
    );
    const navigation = result.calls.find(
      call => call.name === 'new_page' || call.name === 'navigate_page',
    );
    assert.ok(typeof navigation?.args.url === 'string');
    assert.ok(typeof overrideCall.args.route === 'string');
    const scriptUrl = new URL('/my-third-party.js', navigation.args.url);
    assert.ok(new URLPattern(overrideCall.args.route).test(scriptUrl.href));
    assert.ok(
      overrideCall.args.resourceType === undefined ||
        overrideCall.args.resourceType === 'script',
    );
    assert.strictEqual(
      overrideCall.args.upstream,
      'https://www.examplescripts.agi/another.js',
    );
    if (result.hasPageIdRouting) {
      assert.strictEqual(overrideCall.args.pageId, pageId);
    }
  },
};
