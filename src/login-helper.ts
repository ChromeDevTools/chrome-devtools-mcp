/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from 'puppeteer-core';

/**
 * Check if the page requires login
 * More robust than just checking URL
 */
export async function isLoginRequired(page: Page): Promise<boolean> {
  const currentUrl = page.url();

  // Method 1: Check URL
  if (
    currentUrl.includes('auth') ||
    currentUrl.includes('login') ||
    currentUrl.includes('signin')
  ) {
    return true;
  }

  // Method 2: Check for login UI elements
  try {
    // ChatGPT login page has specific elements
    const loginButton = await page.$('button[data-testid="login-button"]');
    const signUpButton = await page.$('a[href*="signup"]');
    const authContainer = await page.$('[class*="auth"]');

    if (loginButton || signUpButton || authContainer) {
      return true;
    }
  } catch {
    // Element check failed, continue to next method
  }

  // Method 3: Check for main content absence
  try {
    // If we can't find the main composer, likely not logged in
    const composer = await page.$('textarea, .ProseMirror[contenteditable="true"]');
    if (!composer) {
      // No composer found - might be login page
      return true;
    }
  } catch {
    // Element check failed
  }

  return false;
}

/**
 * Wait for user to complete login
 * Shows visual guidance and polls for login completion
 */
export async function waitForLogin(
  page: Page,
  options: {
    maxWaitTime?: number; // milliseconds
    pollInterval?: number; // milliseconds
    onStatusUpdate?: (message: string) => void;
  } = {},
): Promise<boolean> {
  const maxWaitTime = options.maxWaitTime || 300000; // 5 minutes default
  const pollInterval = options.pollInterval || 2000; // 2 seconds default
  const onStatusUpdate = options.onStatusUpdate || console.error;

  const startTime = Date.now();

  onStatusUpdate('\n🔐 ログインが必要です');
  onStatusUpdate('📱 ブラウザウィンドウでChatGPTにログインしてください');
  onStatusUpdate(`⏰ 最大待機時間: ${Math.floor(maxWaitTime / 1000)}秒`);
  onStatusUpdate('\n💡 ログイン方法:');
  onStatusUpdate('   1. ブラウザウィンドウでChatGPTのログインボタンをクリック');
  onStatusUpdate('   2. メールアドレスまたはGoogleアカウントでログイン');
  onStatusUpdate('   3. ログイン完了後、自動的に処理が続行されます\n');

  // Poll for login completion
  while (Date.now() - startTime < maxWaitTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    onStatusUpdate(`⏳ ログイン待機中... (${elapsed}秒経過)`);

    // Check if login is completed
    const stillNeedsLogin = await isLoginRequired(page);

    if (!stillNeedsLogin) {
      onStatusUpdate('\n✅ ログイン完了！処理を続行します...\n');
      return true;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout
  onStatusUpdate('\n⏱️ ログイン待機がタイムアウトしました');
  onStatusUpdate('💡 再度実行してください\n');
  return false;
}

/**
 * Ensure user is logged in to ChatGPT
 * If not, guide them through login process
 */
export async function ensureLoggedIn(
  page: Page,
  options: {
    maxWaitTime?: number;
    onStatusUpdate?: (message: string) => void;
  } = {},
): Promise<boolean> {
  const needsLogin = await isLoginRequired(page);

  if (!needsLogin) {
    return true; // Already logged in
  }

  // Wait for user to login
  return await waitForLogin(page, options);
}
