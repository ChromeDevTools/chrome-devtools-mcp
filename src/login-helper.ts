/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

import type {Page} from 'puppeteer-core';

import {
  bringChromeToFront,
  getFrontmostAppName,
  hideChrome,
  activateApp,
} from './applescript-helper.js';

/**
 * Login status enum for state machine
 * Based on ChatGPT/Gemini recommendations
 */
export enum LoginStatus {
  LOGGED_IN = 'LOGGED_IN',
  NEEDS_LOGIN = 'NEEDS_LOGIN',
  IN_PROGRESS = 'IN_PROGRESS', // 2FA or loading
  BLOCKED = 'BLOCKED', // WAF, CAPTCHA, rate limited (ChatGPT recommendation)
}

/**
 * Multi-language ARIA label patterns for Gemini profile button detection
 * Extended based on Gemini's recommendation to add PT/RU/AR
 */
const GEMINI_PROFILE_PATTERNS = [
  'Google Account', // English
  'Google アカウント', // Japanese
  'Compte Google', // French
  'Google-Konto', // German
  'Cuenta de Google', // Spanish
  'Account Google', // Italian
  '구글 계정', // Korean
  '谷歌帐户', // Chinese Simplified
  'Google 帳戶', // Chinese Traditional
  'Conta do Google', // Portuguese (Gemini recommendation)
  'Аккаунт Google', // Russian (Gemini recommendation)
  'حساب Google', // Arabic (Gemini recommendation)
];

/**
 * Probe ChatGPT session via API endpoint (most reliable method)
 * Based on ChatGPT's recommendation to use /api/auth/session
 * Improved with stricter validation and HTTP status handling
 */
export async function probeChatGPTSession(page: Page): Promise<LoginStatus> {
  try {
    const result = await page.evaluate(async () => {
      try {
        // Use AbortController for timeout (ChatGPT recommendation)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const r = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const contentType = r.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');

        // Handle non-JSON responses (WAF/interstitial pages)
        if (!isJson) {
          return {
            ok: false,
            status: r.status,
            isHtml: true,
            error: 'Non-JSON response',
          };
        }

        const j = await r.json().catch(() => ({}));
        return {ok: r.ok, status: r.status, json: j};
      } catch (e) {
        const isAbort = e instanceof Error && e.name === 'AbortError';
        return {ok: false, error: String(e), isTimeout: isAbort};
      }
    });

    // Handle timeout
    if (result?.isTimeout) {
      console.error('[login-helper] Session probe timed out');
      return LoginStatus.IN_PROGRESS;
    }

    // Handle HTML response (WAF/blocked)
    if (result?.isHtml) {
      console.error(
        '[login-helper] Session probe returned HTML (possibly blocked)',
      );
      return LoginStatus.BLOCKED;
    }

    // Handle HTTP error statuses (ChatGPT recommendation)
    if (result?.status === 429) {
      console.error('[login-helper] Rate limited (429)');
      return LoginStatus.BLOCKED;
    }
    if (result?.status === 401 || result?.status === 403) {
      console.error(`[login-helper] Auth error (${result.status})`);
      return LoginStatus.NEEDS_LOGIN;
    }

    if (!result?.ok) {
      console.error('[login-helper] Session probe failed:', result);
      return LoginStatus.IN_PROGRESS;
    }

    // Stricter validation: check for specific fields (ChatGPT recommendation)
    const j = result.json ?? {};
    const hasUser = j?.user?.id || j?.user?.email;
    const hasToken = j?.accessToken;
    const loggedIn = !!(hasUser || hasToken);

    console.error(
      `[login-helper] ChatGPT session probe: ${loggedIn ? 'LOGGED_IN' : 'NEEDS_LOGIN'} (user: ${!!hasUser}, token: ${!!hasToken})`,
    );
    return loggedIn ? LoginStatus.LOGGED_IN : LoginStatus.NEEDS_LOGIN;
  } catch (error) {
    console.error(`[login-helper] Error probing ChatGPT session: ${error}`);
    return LoginStatus.IN_PROGRESS;
  }
}

/**
 * Get Gemini login status using ARIA labels (multi-language support)
 * Based on Gemini's recommendation to use aria-label patterns
 * Added fail-fast Sign In detection (Gemini recommendation)
 */
export async function getGeminiStatus(page: Page): Promise<LoginStatus> {
  const url = page.url();

  // URL-based check (fastest)
  if (url.includes('accounts.google.com')) {
    console.error('[login-helper] Gemini: On Google login page');
    return LoginStatus.NEEDS_LOGIN;
  }

  try {
    const result = await page.evaluate((patterns: string[]) => {
      // FAIL-FAST: Check for Sign In link (Gemini recommendation)
      // This is language-agnostic and very reliable
      const signInLink = document.querySelector(
        'a[href*="accounts.google.com/ServiceLogin"]',
      );
      if (signInLink) {
        return {signInPresent: true, profileFound: false};
      }

      // Check for Terms of Service / dialog blocking the UI (Gemini recommendation)
      const hasBlockingDialog =
        document.querySelector('[role="dialog"]') !== null;

      // Method 1: Check aria-label attribute
      for (const pattern of patterns) {
        if (document.querySelector(`button[aria-label*="${pattern}"]`)) {
          return {
            signInPresent: false,
            profileFound: true,
            hasDialog: hasBlockingDialog,
          };
        }
      }

      // Method 2: Check button text content (Gemini may not use aria-label)
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const pattern of patterns) {
        const found = buttons.some(btn => btn.textContent?.includes(pattern));
        if (found) {
          return {
            signInPresent: false,
            profileFound: true,
            hasDialog: hasBlockingDialog,
          };
        }
      }

      // Fallback: check for nav with chat history (logged-in indicator)
      if (document.querySelector('nav[aria-label*="Recent"]')) {
        return {
          signInPresent: false,
          profileFound: true,
          hasDialog: hasBlockingDialog,
        };
      }

      // Fallback: check for textbox (user is on main chat page)
      if (document.querySelector('[role="textbox"]')) {
        return {
          signInPresent: false,
          profileFound: true,
          hasDialog: hasBlockingDialog,
        };
      }

      return {
        signInPresent: false,
        profileFound: false,
        hasDialog: hasBlockingDialog,
      };
    }, GEMINI_PROFILE_PATTERNS);

    // Fail-fast: Sign In link present means not logged in
    if (result.signInPresent) {
      console.error('[login-helper] Gemini: Sign In link detected (fail-fast)');
      return LoginStatus.NEEDS_LOGIN;
    }

    // Logged in but dialog blocking
    if (result.profileFound && result.hasDialog) {
      console.error(
        '[login-helper] Gemini: Logged in but dialog present (Terms of Service?)',
      );
      return LoginStatus.IN_PROGRESS;
    }

    console.error(
      `[login-helper] Gemini check: ${result.profileFound ? 'LOGGED_IN' : 'NEEDS_LOGIN'}`,
    );
    return result.profileFound
      ? LoginStatus.LOGGED_IN
      : LoginStatus.NEEDS_LOGIN;
  } catch (error) {
    console.error(`[login-helper] Error checking Gemini status: ${error}`);
    return LoginStatus.IN_PROGRESS;
  }
}

/**
 * Get login status for a specific provider
 */
export async function getLoginStatus(
  page: Page,
  provider: 'chatgpt' | 'gemini',
): Promise<LoginStatus> {
  if (provider === 'chatgpt') {
    // Try session probe first (most reliable)
    const sessionStatus = await probeChatGPTSession(page);
    if (sessionStatus !== LoginStatus.IN_PROGRESS) {
      return sessionStatus;
    }
    // Fallback to DOM-based detection
    const needsLogin = await isLoginRequired(page);
    return needsLogin ? LoginStatus.NEEDS_LOGIN : LoginStatus.LOGGED_IN;
  } else {
    return await getGeminiStatus(page);
  }
}

/**
 * Default login timeout: 5 minutes (for 2FA, SMS auth, Authenticator apps)
 */
const LOGIN_TIMEOUT_MS = 300000;

/**
 * Wait for login with auto-polling and backoff
 * Returns when user logs in or timeout occurs
 *
 * Improvements (v0.x.x):
 * - Extended timeout: 5 minutes (2FA/SMS/Authenticator support)
 * - Browser brought to front for visibility
 * - Progress updates with remaining time (every 15 seconds)
 * - Clear success feedback on login detection
 */
export async function waitForLoginStatus(
  page: Page,
  provider: 'chatgpt' | 'gemini',
  timeoutMs = LOGIN_TIMEOUT_MS,
  onStatusUpdate?: (message: string) => void,
): Promise<LoginStatus> {
  const log = onStatusUpdate || console.error;
  const start = Date.now();
  let delay = 500;
  let lastProgressReport = 0;
  let previousApp: string | undefined;

  // Bring browser to front so user can see login page
  // On macOS, use AppleScript to unhide and activate Chrome
  if (os.platform() === 'darwin') {
    try {
      previousApp = await getFrontmostAppName();
      await bringChromeToFront();
      await page.bringToFront();
      log('📱 Chromeを前面に出しました');
    } catch (error) {
      log(
        `⚠️  Chromeの前面化に失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    try {
      await page.bringToFront();
    } catch {
      // Ignore errors (page might be closed)
    }
  }

  // 監視開始を即座に通知（最初の進捗表示まで15秒待たせない）
  log('👀 ログインを監視中... 検出でき次第すぐにお知らせします');

  while (Date.now() - start < timeoutMs) {
    const status = await getLoginStatus(page, provider);
    if (status === LoginStatus.LOGGED_IN) {
      log('✅ ログイン検出！処理を続行します');

      // On macOS, hide Chrome and restore focus to previous app
      if (os.platform() === 'darwin' && previousApp) {
        try {
          await new Promise((r) => setTimeout(r, 500)); // Small delay for better UX
          await hideChrome();
          await activateApp(previousApp);
          log(`✅ ${previousApp} に戻しました`);
        } catch (error) {
          log(
            `⚠️  アプリの復帰に失敗: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return status;
    }

    // Progress update every 15 seconds with remaining time (minutes:seconds format)
    const elapsed = Date.now() - start;
    if (elapsed - lastProgressReport >= 15000) {
      const remainingMs = timeoutMs - elapsed;
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.ceil((remainingMs % 60000) / 1000);
      const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
      log(`⏳ ログイン待機中... 残り ${timeStr}`);
      lastProgressReport = elapsed;
    }

    await new Promise(r => setTimeout(r, delay));
    // Backoff with jitter (ChatGPT recommendation: ±10-20% randomization)
    const jitter = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
    delay = Math.min(3000, Math.floor(delay * 1.5 * jitter));
  }

  log('❌ ログインタイムアウト（5分）');
  return LoginStatus.NEEDS_LOGIN;
}

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
    console.error(
      '[login-helper] ✅ Login required (URL contains auth/login/signin)',
    );
    return true;
  }

  // Gemini specific check
  if (currentUrl.includes('gemini.google.com')) {
    try {
      const geminiContent = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        // Check for common login page text
        const hasLoginText =
          bodyText.includes('sign in') ||
          bodyText.includes('login') ||
          bodyText.includes('google account');

        // Check for Gemini composer
        const hasComposer = !!(
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector('textarea')
        );

        return {hasLoginText, hasComposer};
      });

      console.error(
        `[login-helper] Gemini check: ${JSON.stringify(geminiContent)}`,
      );

      if (geminiContent.hasComposer) {
        console.error(
          '[login-helper] ❌ Login NOT required (Gemini composer detected)',
        );
        return false;
      }

      console.error(
        '[login-helper] ✅ Login required (Gemini composer missing)',
      );
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
      const hasLoginText =
        bodyText.includes('log in') ||
        bodyText.includes('sign in') ||
        bodyText.includes('welcome to chatgpt');

      // Check for login buttons - NATIVE DOM selectors only
      const hasLoginButton = !!(
        document.querySelector('[data-testid*="login"]') ||
        document.querySelector('[class*="login-button"]') ||
        // Check for text content in buttons
        Array.from(document.querySelectorAll('button')).some(
          btn =>
            btn.textContent?.toLowerCase().includes('log in') ||
            btn.textContent?.toLowerCase().includes('sign in'),
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
          console.error(
            '[login-helper] Found valid #prompt-textarea (not fallback)',
          );
          hasComposer = true;
        } else {
          console.error(
            '[login-helper] Found #prompt-textarea but it appears to be a fallback/disabled textarea',
          );
        }
      }

      // Method 2: Check Shadow DOM for ChatGPT's composer
      if (!hasComposer) {
        const shadowHosts = Array.from(document.querySelectorAll('*'));
        for (const host of shadowHosts) {
          if (host.shadowRoot) {
            const shadowTextarea =
              host.shadowRoot.querySelector('#prompt-textarea');
            const shadowComposer = host.shadowRoot.querySelector(
              '[data-testid="composer-textarea"]',
            );
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
        const proseMirror = document.querySelector(
          '.ProseMirror[contenteditable="true"]',
        );
        // Verify it's actually ChatGPT's main composer, not just any ProseMirror
        if (proseMirror) {
          const parent = proseMirror.closest(
            '[class*="composer"], [class*="prompt"], [class*="input-area"]',
          );
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
        bodySnippet: bodyText.substring(0, 200),
      };
    });

    console.error(
      `[login-helper] Page analysis: ${JSON.stringify(pageContent, null, 2)}`,
    );

    // Decision point 1: PRIORITY - Login button present = needs login (even if fallback composer exists)
    if (pageContent.hasLoginButton) {
      console.error(
        '[login-helper] 🔍 Decision: Login button detected (highest priority)',
      );
      console.error(
        '[login-helper]    hasLoginButton:',
        pageContent.hasLoginButton,
      );
      console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
      console.error('[login-helper] ✅ Login required (login button detected)');
      return true;
    }

    // Decision point 2: Login text present + NO valid composer = needs login
    if (pageContent.hasLoginText && !pageContent.hasComposer) {
      console.error(
        '[login-helper] 🔍 Decision: Login text detected + No valid composer',
      );
      console.error(
        '[login-helper]    hasLoginText:',
        pageContent.hasLoginText,
      );
      console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
      console.error(
        '[login-helper] ✅ Login required (login UI detected, no composer)',
      );
      return true;
    }

    // Decision point 3: Valid composer present = logged in
    if (pageContent.hasComposer) {
      console.error(
        '[login-helper] 🔍 Decision: Valid composer found (user is logged in)',
      );
      console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
      console.error('[login-helper] ❌ Login NOT required (composer detected)');
      return false;
    }

    // Decision point 3: Ambiguous state - safe default is to assume login required
    console.error(
      '[login-helper] 🔍 Decision: Unclear state (no login UI, no composer)',
    );
    console.error('[login-helper]    hasLoginText:', pageContent.hasLoginText);
    console.error(
      '[login-helper]    hasLoginButton:',
      pageContent.hasLoginButton,
    );
    console.error('[login-helper]    hasComposer:', pageContent.hasComposer);
    console.error('[login-helper]    bodySnippet:', pageContent.bodySnippet);
    console.error(
      '[login-helper] ⚠️ Unclear state - assuming login required for safety',
    );
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
    await new Promise(resolve => setTimeout(resolve, pollInterval));
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
