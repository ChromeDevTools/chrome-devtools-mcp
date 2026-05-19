/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Create a new page <TEST_URL> in an isolated context called contextB. Take a screenshot there.',
  maxTurns: 3,
  htmlRoute: {
    path: '/isolated_context.html',
    htmlContent: '<h1>Isolated Context</h1>',
  },
  expectations: result => {
    result.assertNextCall('new_page', {isolatedContext: 'contextB'});
    result.assertNextCall(
      'take_screenshot',
      result.hasPageIdRouting ? {pageId: 2} : undefined,
    );
  },
};
