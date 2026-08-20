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
    assert.ok(result.remainingCalls.length >= 3);
    result.assertNextCall('new_page', {isolatedContext: 'banner-test'});
    const snapshotCall = result.assertNextCall('take_snapshot');
    const pageId = result.hasPageIdRouting
      ? (snapshotCall.args.pageId as number)
      : undefined;
    result.assertNextCall('click', {
      uid: 'decline-btn',
      ...(result.hasPageIdRouting ? {pageId} : {}),
    });
  },
};
