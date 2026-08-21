/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Open <TEST_URL> in an isolated browser context called banner-test to check the cookie consent banner, take a snapshot, and click Decline.',
  maxTurns: 4,
  htmlRoute: {
    path: '/cookie_banner_test.html',
    htmlContent: `
      <h1>Cookie Consent Test</h1>
      <div id="cookie-banner">
        <p>We use cookies to improve your experience.</p>
        <button id="accept-btn">Accept All</button>
        <button id="decline-btn">Decline</button>
      </div>
    `,
  },
  expectations: result => {
    const newPageCall = result.calls.find(c => c.name === 'new_page');
    assert.ok(
      newPageCall,
      'Expected new_page to be called for isolated context testing',
    );
    assert.strictEqual(
      newPageCall.args.isolatedContext,
      'banner-test',
      "Expected isolatedContext to be 'banner-test'",
    );

    const pageId = result.consumePageNavigation();
    assert.ok(result.remainingCalls.length >= 2);
    const snapshotCall = result.assertNextCall('take_snapshot');
    const targetPageId = result.hasPageIdRouting
      ? ((snapshotCall.args.pageId as number) ?? pageId)
      : undefined;
    result.assertNextCall('click', {
      uid: 'decline-btn',
      ...(result.hasPageIdRouting ? {pageId: targetPageId} : {}),
    });
  },
};
