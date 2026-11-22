
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {test} from '@playwright/test';

import {authenticateAndSaveState} from '../../playwright/auth.js';

test('authenticate and persist session', async ({browser}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await authenticateAndSaveState({context, page});
  await context.close();
});
