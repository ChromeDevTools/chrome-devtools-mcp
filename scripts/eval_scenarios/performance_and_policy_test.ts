/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Navigate to <TEST_URL>, record a performance trace (with reload: true and autoStop: true) to check its performance, and also attempt to list installed Chrome extensions using list_extensions (if extensions are restricted or disabled by policy, report that clearly).',
  maxTurns: 6,
  htmlRoute: {
    path: '/perf_and_policy_test.html',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head><title>Performance & Policy Test</title></head>
        <body>
          <h1>Dashboard Performance Test</h1>
          <script>
            const start = performance.now();
            while (performance.now() - start < 20) {}
            console.log('Dashboard loaded');
          </script>
        </body>
      </html>
    `,
  },
  expectations: result => {
    result.assertCapabilityEnabled('performance');
    result.consumePageNavigation();
    const perfCall = result.calls.find(
      c => c.name === 'performance_start_trace',
    );
    assert.ok(perfCall, 'Expected performance_start_trace to be called');
    if (result.hasMetaFeatureSystem) {
      const extExecuted = result.calls.some(c => c.name === 'list_extensions');
      assert.strictEqual(
        extExecuted,
        false,
        'Expected list_extensions (extensions pack) to be blocked by locked security policy when --meta-feature-system is enabled',
      );
    }
  },
};
