
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {test, expect} from '@playwright/test';

import {jiraMetadata} from '../../playwright/metadata.js';
import {hasPersistentAuth} from '../../playwright/auth.js';

test('jira metadata serializes report annotations', () => {
  expect(jiraMetadata({projectKey: 'QA', labels: ['e2e']})).toEqual({
    type: 'jira',
    description: '{"projectKey":"QA","labels":["e2e"]}',
  });
});

test('persistent authentication reports only existing storage state', () => {
  expect(hasPersistentAuth('/definitely/not/a/storage/state.json')).toBe(false);
});
