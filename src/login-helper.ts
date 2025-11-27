/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Page } from 'puppeteer-core';

/**
 * Check if the page requires login
 * More robust than just checking URL
 */
export async function isLoginRequired(page: Page): Promise<boolean> {
  const currentUrl = page.url();

  console.error(`[login-helper] Checking login status for URL: ${currentUrl}`);

  // Method 1: Check URL patterns
  if (
    currentUrl.includes('auth') ||
    currentUrl.includes('login') ||
    currentUrl.includes('signin')
  ) {
    console.error('[login-helper] ✅ Login required (URL contains auth/login/signin)');
    return true;
  }

  // Gemini specific check
  if (currentUrl.includes('gemini.google.com')) {
    try {
      const geminiContent = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        // Check for common login page text
        const hasLoginText = bodyText.includes('sign in') ||
          bodyText.includes('login') ||
          bodyText.includes('google account');

        // Check for Gemini composer
        const hasComposer = !!(
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector('textarea')
        );

        return { hasLoginText, hasComposer };
      });

      console.error(`[login-helper] Gemini check: ${JSON.stringify(geminiContent)}`);

      if (geminiContent.hasComposer) {
        console.error('[login-helper] ❌ Login NOT required (Gemini composer detected)');
        return false;
      }

      console.error('[login-helper] ✅ Login required (Gemini composer missing)');
      return true;
    } catch (error) {
      console.error(`[login-helper] Error checking Gemini login: ${error}`);
      return true;
    }
  }

  // Method 2: Check page content for login indicators
  try {
    const pageContent = await page.evaluate(() => {
      // Check for common login page text
      const bodyText = document.body.innerText.toLowerCase();

      // ChatGPT-specific login indicators
      const hasLoginText = bodyText.includes('log in') ||
        bodyText.includes('sign in') ||
        bodyText.includes('welcome to chatgpt');

      // Check for login buttons - NATIVE DOM selectors only
      const hasLoginButton = !!(
        document.querySelector('[data-testid*="login"]') ||
        document.querySelector('[class*="login-button"]') ||
        // Check for text content in buttons
        Array.from(document.querySelectorAll('button')).some(btn =>
          btn.textContent?.toLowerCase().includes('log in') ||
          btn.textContent?.toLowerCase().includes('sign in')
        )
      );

      // Check for ChatGPT-specific composer (more strict detection)
      // Look for the actual textarea/contenteditable that ChatGPT uses
      let hasComposer = false;

      // Method 1: Check for ChatGPT's main textarea (with validation)
      const mainTextarea = document.querySelector('#prompt-textarea');
      if (mainTextarea && mainTextarea instanceof HTMLTextAreaElement) {
        // Additional validation: login page has a fallback textarea with class "_fallbackTextarea_"
        // Real composer should NOT be disabled and should be in a proper composer container
        const isFallback = mainTextarea.className.includes('fallback');
        const isDisabled = mainTextarea.disabled;

        if (!isFallback && !isDisabled) {
          console.error('[login-helper] Found valid #prompt-textarea (not fallback)');
          hasComposer = true;
        } else {
          console.error('[login-helper] Found #prompt-textarea but it appears to be a fallback/disabled textarea');
        }
      }

      // Method 2: Check Shadow DOM for ChatGPT's composer
      if (!hasComposer) {
        const shadowHosts = Array.from(document.querySelectorAll('*'));
        for (const host of shadowHosts) {
          if (host.shadowRoot) {
            const shadowTextarea = host.shadowRoot.querySelector('#prompt-textarea');
            const shadowComposer = host.shadowRoot.querySelector('[data-testid="composer-textarea"]');
            if (shadowTextarea || shadowComposer) {
              console.error('[login-helper] Found composer in Shadow DOM');
              hasComposer = true;
              break;
            }
          }
        }
      }

      // Method 3: Check for ChatGPT-specific ProseMirror editor (only if it's in main content area)
      if (!hasComposer) {
        const proseMirror = document.querySelector('.ProseMirror[contenteditable="true"]');
        // Verify it's actually ChatGPT's main composer, not just any ProseMirror
        if (proseMirror) {
          const parent = proseMirror.closest('[class*="composer"], [class*="prompt"], [class*="input-area"]');
          if (parent) {
            console.error('[login-helper] Found ChatGPT ProseMirror composer');
            hasComposer = true;
          }
        }
      }

      return {
        hasLoginText,
        hasLoginButton,
        hasComposer,
        bodySnippet: bodyText.substring(0, 200)
      };
    });

    console.error(`[login-helper] Page analysis: ${JSON.stringify(pageContent, null, 2)}`);

    // Decision point 1: PRIORITY - Login button present = needs login (even if fallback composer exists)
    if (pageContent.hasLoginButton) {
      console.error('[login-helper] 🔍 Decision: Login button detected (highest priority)');
      console.error('[login-helper]    hasLoginButton:', pageContent.hasLoginButton);
      console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
      console.error('[login-helper] ✅ Login required (login button detected)');
      return true;
    }

    // Decision point 2: Login text present + NO valid composer = needs login
    if (pageContent.hasLoginText && !pageContent.hasComposer) {
      console.error('[login-helper] 🔍 Decision: Login text detected + No valid composer');
      console.error('[login-helper]    hasLoginText:', pageContent.hasLoginText);
      console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
      console.error('[login-helper] ✅ Login required (login UI detected, no composer)');
      return true;
    }

    // Decision point 3: Valid composer present = logged in
    if (pageContent.hasComposer) {
      console.error('[login-helper] 🔍 Decision: Valid composer found (user is logged in)');
      console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
      console.error('[login-helper] ❌ Login NOT required (composer detected)');
      return false;
    }

    // Decision point 3: Ambiguous state - safe default is to assume login required
    console.error('[login-helper] 🔍 Decision: Unclear state (no login UI, no composer)');
    console.error('[login-helper]    hasLoginText:', pageContent.hasLoginText);
    console.error('[login-helper]    hasLoginButton:', pageContent.hasLoginButton);
    console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
    console.error('[login-helper]    bodySnippet:', pageContent.bodySnippet);
    console.error('[login-helper] ⚠️ Unclear state - assuming login required for safety');
    return true;

  } catch (error) {
    console.error(`[login-helper] Error during page content check: ${error}`);
    // On error, assume login required for safety
    return true;
  }
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
