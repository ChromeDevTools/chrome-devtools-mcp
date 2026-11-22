
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {BrowserContext, Page} from '@playwright/test';
import {existsSync} from 'node:fs';
import path from 'node:path';

export interface PersistentAuthOptions {
  storageStatePath?: string;
  loginUrl?: string;
  username?: string;
  password?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  context: BrowserContext;
  page: Page;
}

export async function authenticateAndSaveState(
  options: PersistentAuthOptions,
): Promise<string> {
  const storageStatePath =
    options.storageStatePath ??
    process.env.PLAYWRIGHT_STORAGE_STATE ??
    path.resolve('.auth/storage-state.json');
  const loginUrl = options.loginUrl ?? process.env.QA_LOGIN_URL;
  const username = options.username ?? process.env.QA_USERNAME;
  const password = options.password ?? process.env.QA_PASSWORD;
  const usernameSelector =
    options.usernameSelector ??
    process.env.QA_USERNAME_SELECTOR ??
    'input[type="email"]';
  const passwordSelector =
    options.passwordSelector ??
    process.env.QA_PASSWORD_SELECTOR ??
    'input[type="password"]';
  const submitSelector =
    options.submitSelector ??
    process.env.QA_LOGIN_SUBMIT_SELECTOR ??
    'button[type="submit"]';

  if (!loginUrl || !username || !password) {
    throw new Error(
      'Persistent authentication requires QA_LOGIN_URL, QA_USERNAME, and ' +
        'QA_PASSWORD',
    );
  }

  await options.page.goto(loginUrl);
  await options.page.fill(usernameSelector, username);
  await options.page.fill(passwordSelector, password);
  await options.page.click(submitSelector);
  await options.page.waitForLoadState('networkidle');
  await options.context.storageState({path: storageStatePath});
  return storageStatePath;
}

export function hasPersistentAuth(
  storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE,
): boolean {
  return Boolean(
    storageStatePath &&
      storageStatePath.trim() &&
      existsSync(storageStatePath),
  );
}
