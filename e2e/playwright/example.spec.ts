
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {test, expect} from '@playwright/test';

import {attachApolloRuntimeMonitor} from '../../playwright/apollo.js';
import {jiraMetadata} from '../../playwright/metadata.js';

test.describe('QA smoke test', () => {
  test(
    'loads the configured application',
    {
      annotation: jiraMetadata({
        projectKey: process.env.JIRA_PROJECT_KEY,
        labels: ['e2e', 'qa-smoke'],
      }),
    },
    async ({page}) => {
      const apollo = attachApolloRuntimeMonitor(page);
      await page.goto('/');
      await expect(page).toHaveTitle(/.+/);
      apollo.assertNoGraphQLErrors();
    },
  );
});
