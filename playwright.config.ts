
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {defineConfig, devices} from '@playwright/test';
import type {ReporterDescription} from '@playwright/test';

import {JiraReporter} from './playwright/reporters/JiraReporter.js';

const baseURL = process.env.QA_BASE_URL ?? 'https://example.invalid';
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const reporters: ReporterDescription[] = [
  ['list'],
  ['html', {open: 'never', outputFolder: 'playwright-report'}],
];

if (process.env.JIRA_CREATE_BUGS === 'true') {
  reporters.push([JiraReporter, {enabled: true}]);
}

// Playwright requires a default config export.
// eslint-disable-next-line no-restricted-syntax
export default defineConfig({
  testDir: './e2e/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: reporters,
  use: {
    baseURL,
    storageState,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
  ],
});
