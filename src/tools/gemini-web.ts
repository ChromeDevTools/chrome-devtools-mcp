/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import type {Page} from 'puppeteer-core';
import z from 'zod';

import {GEMINI_CONFIG} from '../config.js';
import {
  getLoginStatus,
  waitForLoginStatus,
  LoginStatus,
} from '../login-helper.js';
import {loadGeminiSelectors, getGeminiSelector} from '../selectors/loader.js';

import {ToolCategories} from './categories.js';
import {defineTool, type Context} from './ToolDefinition.js';

/**
 * Navigate with retry logic for handling ERR_ABORTED and other network errors
 */
async function navigateWithRetry(
  page: Page,
  url: string,
  options: {
    waitUntil: 'networkidle2' | 'domcontentloaded' | 'load';
    maxRetries?: number;
  } = {waitUntil: 'networkidle2', maxRetries: 3},
): Promise<void> {
  const {waitUntil, maxRetries = 3} = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, {waitUntil, timeout: 30000});
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a retryable error
      const isRetryable =
        lastError.message.includes('ERR_ABORTED') ||
        lastError.message.includes('ERR_CONNECTION_RESET') ||
        lastError.message.includes('net::ERR_');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw lastError;
}

/**
 * Find or create a dedicated Gemini tab
 * Returns existing Gemini tab if found, otherwise creates a new one
 */
async function getOrCreateGeminiPage(context: Context): Promise<Page> {
  // Refresh pages list
  await context.createPagesSnapshot();
  const pages = context.getPages();

  // Look for existing Gemini tab
  for (const page of pages) {
    const url = page.url();
    if (url.includes('gemini.google.com')) {
      await page.bringToFront();
      return page;
    }
  }

  // No Gemini tab found, create a new one
  const newPage = await context.newPage();
  return newPage;
}

/**
 * Path to store chat session data
 */
const CHAT_SESSIONS_FILE = path.join(
  process.cwd(),
  'docs/ask/gemini/.chat-sessions.json',
);

interface ChatSession {
  chatId: string;
  url: string;
  lastUsed: string;
  title?: string;
  createdAt: string;
  conversationCount?: number;
}

type ChatSessions = Record<string, ChatSession[]>;

/**
 * Load chat sessions from JSON file
 */
async function loadChatSessions(): Promise<ChatSessions> {
  try {
    const data = await fs.promises.readFile(CHAT_SESSIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save a chat session for a project
 */
async function saveChatSession(
  projectName: string,
  session: ChatSession,
): Promise<void> {
  const sessions = await loadChatSessions();

  if (!sessions[projectName]) {
    sessions[projectName] = [];
  }

  const existingIndex = sessions[projectName].findIndex(
    s => s.chatId === session.chatId,
  );

  if (existingIndex >= 0) {
    sessions[projectName][existingIndex] = {
      ...sessions[projectName][existingIndex],
      ...session,
      lastUsed: new Date().toISOString(),
    };
  } else {
    sessions[projectName].push({
      ...session,
      createdAt: session.createdAt || new Date().toISOString(),
    });
  }

  const dir = path.dirname(CHAT_SESSIONS_FILE);
  await fs.promises.mkdir(dir, {recursive: true});

  await fs.promises.writeFile(
    CHAT_SESSIONS_FILE,
    JSON.stringify(sessions, null, 2),
    'utf-8',
  );
}

/**
 * Sanitize question
 */
function sanitizeQuestion(text: string): string {
  const passwordPatterns = [
    /password\s*[:=]\s*\S+/gi,
    /パスワード\s*[:：=]\s*\S+/gi,
    /pwd\s*[:=]\s*\S+/gi,
    /secret\s*[:=]\s*\S+/gi,
  ];

  let sanitized = text;
  for (const pattern of passwordPatterns) {
    sanitized = sanitized.replace(pattern, '[パスワードは除外されました]');
  }

  return sanitized;
}

/**
 * Save conversation log
 */
async function saveConversationLog(
  projectName: string,
  question: string,
  response: string,
  metadata: {
    thinkingTime?: number;
    chatUrl?: string;
    model?: string;
    chatId?: string;
    conversationNumber?: number;
  },
): Promise<string> {
  const now = new Date();
  const timestamp = [
    String(now.getFullYear()).slice(2).padStart(2, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const topicSlug = question
    .substring(0, 50)
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/gi, '-')
    .toLowerCase()
    .slice(0, 30);

  let logPath: string;
  if (metadata.chatId) {
    const conversationNum = String(metadata.conversationNumber || 1).padStart(
      3,
      '0',
    );
    const filename = `${conversationNum}-${timestamp}-${topicSlug}.md`;
    const logDir = path.join('docs/ask/gemini', metadata.chatId);
    logPath = path.join(process.cwd(), logDir, filename);
    await fs.promises.mkdir(path.join(process.cwd(), logDir), {
      recursive: true,
    });
  } else {
    const filename = `${timestamp}-${projectName}-${topicSlug}.md`;
    const logDir = 'docs/ask/gemini';
    logPath = path.join(process.cwd(), logDir, filename);
    await fs.promises.mkdir(path.dirname(logPath), {recursive: true});
  }

  const content = `# ${topicSlug}

## 📅 メタ情報
- **日時**: ${now.toLocaleString('ja-JP')}
- **プロジェクト**: ${projectName}
- **AIモデル**: ${metadata.model || 'Gemini'}
${metadata.chatId ? `- **チャットID**: ${metadata.chatId}\n` : ''}${metadata.conversationNumber ? `- **会話番号**: ${metadata.conversationNumber}\n` : ''}${metadata.chatUrl ? `- **チャットURL**: ${metadata.chatUrl}\n` : ''}
## ❓ 質問

${question}

## 💬 回答

${response}
`;

  await fs.promises.writeFile(logPath, content, 'utf-8');
  return path.relative(process.cwd(), logPath);
}

export const askGeminiWeb = defineTool({
  name: 'ask_gemini_web',
  description:
    'Ask Gemini via browser. Logs to docs/ask/gemini/. ' +
    'IMPORTANT: Always continues existing project chat by default. ' +
    'Only set createNewChat=true when user explicitly says "新規で" or "new chat".',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    question: z
      .string()
      .describe(
        'Detailed question to ask. Structure with: ' +
          '(1) Context (tech stack, versions, constraints), ' +
          '(2) Current State (exact error/logs/behavior), ' +
          '(3) Goal (expected outcome), ' +
          '(4) Attempts (what was tried, why it failed), ' +
          '(5) Format (steps/code/table). ' +
          "IMPORTANT: Do not mention you are an AI/MCP. No secrets/PII. Don't guess missing facts.",
      ),
    projectName: z.string().optional().describe('Project name (default: cwd)'),
    createNewChat: z
      .boolean()
      .optional()
      .describe(
        'Force new chat. Only use true when user explicitly requests "新規で" or "new chat". ' +
          'Default false = always continue existing project chat.',
      ),
  },
  handler: async (request, response, context) => {
    const {question, projectName, createNewChat = false} = request.params;
    const sanitizedQuestion = sanitizeQuestion(question);
    const project =
      projectName || path.basename(process.cwd()) || 'unknown-project';

    // Get or create a dedicated Gemini tab
    const page = await getOrCreateGeminiPage(context);

    try {
      let isNewChat = false;
      let sessionChatId: string | undefined;
      let targetUrl: string;

      // Determine target URL first (avoid unnecessary navigation)
      if (!createNewChat) {
        const sessions = await loadChatSessions();
        const projectSessions = sessions[project] || [];

        if (projectSessions.length > 0) {
          const sortedSessions = [...projectSessions].sort(
            (a, b) =>
              new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime(),
          );
          const latestSession = sortedSessions[0];
          targetUrl = latestSession.url;
          sessionChatId = latestSession.chatId;
          response.appendResponseLine(`既存チャット: ${latestSession.chatId}`);
        } else {
          isNewChat = true;
          targetUrl = GEMINI_CONFIG.BASE_URL + 'app';
        }
      } else {
        isNewChat = true;
        targetUrl = GEMINI_CONFIG.BASE_URL + 'app';
      }

      // Navigate directly to target URL (skip intermediate navigation)
      response.appendResponseLine('Geminiに接続中...');
      await navigateWithRetry(page, targetUrl, {waitUntil: 'networkidle2'});

      // Wait for Gemini SPA to fully render using selector-based detection
      // Instead of fixed 1000ms wait, wait for either profile button (logged in) or login link
      try {
        await Promise.race([
          page.waitForSelector(
            'button[aria-label*="Account"], button[aria-label*="アカウント"]',
            {timeout: 10000},
          ),
          page.waitForSelector('a[href*="accounts.google.com"]', {
            timeout: 10000,
          }),
          page.waitForSelector('[role="textbox"]', {timeout: 10000}),
        ]);
      } catch {
        // Timeout is acceptable - continue with login check
        response.appendResponseLine('⚠️ UI安定化待機タイムアウト（続行）');
      }

      // Check login using ARIA-based detection (multi-language support)
      const loginStatus = await getLoginStatus(page, 'gemini');

      if (loginStatus === LoginStatus.NEEDS_LOGIN) {
        response.appendResponseLine('\n🔐 ログインが必要です');
        response.appendResponseLine(
          '📱 ブラウザウィンドウを開きました。Googleアカウントでログインしてください',
        );
        response.appendResponseLine(
          '⏳ ログイン完了を自動検出します（最大5分待機）',
        );
        response.appendResponseLine(
          '💡 二段階認証もゆっくり対応できます',
        );
        response.appendResponseLine('');

        // Auto-poll for login completion (max 5 minutes for 2FA support)
        const finalStatus = await waitForLoginStatus(
          page,
          'gemini',
          300000,
          msg => response.appendResponseLine(msg),
        );

        if (finalStatus !== LoginStatus.LOGGED_IN) {
          response.appendResponseLine(
            '❌ ログインがタイムアウトしました。再度お試しください。',
          );
          return;
        }
      } else if (loginStatus === LoginStatus.IN_PROGRESS) {
        // Wait a bit and retry
        await new Promise(r => setTimeout(r, 2000));
        const retryStatus = await getLoginStatus(page, 'gemini');
        if (retryStatus !== LoginStatus.LOGGED_IN) {
          response.appendResponseLine(
            '⚠️ ログイン状態を確認できませんでした。再試行してください。',
          );
          return;
        }
      }

      response.appendResponseLine('✅ ログイン確認完了');

      response.appendResponseLine('質問を送信中...');

      // Input text using innerText + event dispatch for proper Angular state updates
      // This is more reliable than keyboard.type() which can cause sync issues with Angular
      const textboxSelector = '[role="textbox"]';
      const textbox = await page.$(textboxSelector);

      if (!textbox) {
        response.appendResponseLine('❌ 入力欄が見つかりません');
        return;
      }

      // Click to focus
      await textbox.click();

      // Use innerText + input event dispatch for proper Angular state updates
      // This approach is more reliable than keyboard.type() which can cause sync issues
      await textbox.evaluate((el, text) => {
        // Clear and set content
        (el as HTMLElement).innerText = text;
        // Dispatch input event to notify Angular of the change
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }, sanitizedQuestion);

      // Wait for Angular to process the input and show send button
      await new Promise(resolve => setTimeout(resolve, 300));

      // 質問送信前に model-response 要素数を記録（ChatGPTと同じカウント方式）
      const initialModelResponseCount = await page.evaluate(() => {
        return document.querySelectorAll('model-response').length;
      });

      // Click send button - look for "プロンプトを送信" or similar
      const sent = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Primary: look for "プロンプトを送信" button
        let sendButton = buttons.find(
          b =>
            b.textContent?.includes('プロンプトを送信') ||
            b.textContent?.includes('送信') ||
            b.getAttribute('aria-label')?.includes('送信') ||
            b.getAttribute('aria-label')?.includes('Send'),
        );

        // Fallback: look for send icon
        if (!sendButton) {
          sendButton = buttons.find(
            b =>
              b.querySelector('mat-icon[data-mat-icon-name="send"]') ||
              b.querySelector('[data-icon="send"]'),
          );
        }

        if (sendButton && !sendButton.disabled) {
          (sendButton as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!sent) {
        // Fallback: try Enter key
        await page.keyboard.press('Enter');
        response.appendResponseLine(
          '⚠️ 送信ボタンが見つかりません (Enterキーを試行)',
        );
      }

      response.appendResponseLine('回答を待機中...');

      // Wait for response using actual Gemini UI indicators:
      // - Generating: "回答を停止" button appears, "Gemini が入力中です" text
      // - Complete: "Gemini が回答しました" text appears

      // First, wait for Gemini to start generating (Stop button/icon to appear)
      // This typically takes 1-3 seconds after sending
      const maxWaitForStart = 5000; // 5 seconds max to start generating
      const startWaitTime = Date.now();
      let generationStarted = false;

      while (Date.now() - startWaitTime < maxWaitForStart) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const hasStarted = await page.evaluate(() => {
          // Check for stop icon (Gemini's generating indicator)
          const stopIcon =
            document.querySelector('.stop-icon mat-icon[fonticon="stop"]') ||
            document.querySelector('mat-icon[data-mat-icon-name="stop"]') ||
            document.querySelector('.blue-circle.stop-icon');

          // Check for stop button
          const buttons = Array.from(document.querySelectorAll('button'));
          const stopButton = buttons.find(b => {
            const text = b.textContent || '';
            const ariaLabel = b.getAttribute('aria-label') || '';
            return (
              text.includes('回答を停止') ||
              text.includes('Stop') ||
              ariaLabel.includes('Stop') ||
              ariaLabel.includes('停止')
            );
          });

          // Check for typing/thinking indicators
          const bodyText = document.body.innerText;
          const isTyping =
            bodyText.includes('Gemini が入力中です') ||
            bodyText.includes('Gemini is typing') ||
            bodyText.includes('Analyzing') ||
            bodyText.includes('分析中') ||
            bodyText.includes('Thinking') ||
            bodyText.includes('思考中');

          // Check for loading spinners
          const hasSpinner =
            document.querySelector('[role="progressbar"]') !== null ||
            document.querySelector('[aria-busy="true"]') !== null;

          // Check for model-response appearing (even without stop button)
          const hasNewResponse =
            document.querySelectorAll('model-response').length > 0;

          return (
            !!stopIcon ||
            !!stopButton ||
            isTyping ||
            hasSpinner ||
            hasNewResponse
          );
        });

        if (hasStarted) {
          generationStarted = true;
          break;
        }
      }

      if (!generationStarted) {
        response.appendResponseLine(
          '⚠️ 生成開始を検出できませんでした（続行します）',
        );
      }

      const startTime = Date.now();

      // Phase 2: Wait for stop button/icon to disappear (= generation complete)
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const hasStopIndicator = await page.evaluate(() => {
          // Check for stop icon
          const stopIcon =
            document.querySelector('.stop-icon mat-icon[fonticon="stop"]') ||
            document.querySelector('mat-icon[data-mat-icon-name="stop"]') ||
            document.querySelector('.blue-circle.stop-icon') ||
            document.querySelector('div.stop-icon');
          if (stopIcon) return true;

          // Check for stop button
          const buttons = Array.from(document.querySelectorAll('button'));
          const stopButton = buttons.find(b => {
            const text = b.textContent || '';
            const ariaLabel = b.getAttribute('aria-label') || '';
            return (
              text.includes('回答を停止') ||
              text.includes('Stop') ||
              ariaLabel.includes('Stop') ||
              ariaLabel.includes('停止')
            );
          });
          return !!stopButton;
        });

        // Stop button/icon disappeared = check if new message appeared
        if (!hasStopIndicator) {
          // 追加: model-response 要素数が増えたか確認（ChatGPTと同じ方式）
          const currentModelResponseCount = await page.evaluate(() => {
            return document.querySelectorAll('model-response').length;
          });

          if (currentModelResponseCount > initialModelResponseCount) {
            // ストップボタン消滅 AND 新規メッセージ出現で完了
            break;
          }
          // メッセージ数が増えていなければ、まだ待機続行
        }

        if (Date.now() - startTime > 180000) {
          // 3 mins timeout
          response.appendResponseLine('⚠️ タイムアウト（3分）');
          break;
        }
      }

      // Get the final response content (新規に追加された model-response のみを取得)
      const responseText = await page.evaluate(initialCount => {
        // Get content from model-response elements
        const modelResponses = Array.from(
          document.querySelectorAll('model-response'),
        );
        if (modelResponses.length > initialCount) {
          // 新規に追加された model-response を取得（ChatGPTと同じ方式）
          const newResponse = modelResponses[initialCount];
          return newResponse.textContent?.trim() || '';
        }

        // Fallback: get the last model response if any
        if (modelResponses.length > 0) {
          const lastResponse = modelResponses[modelResponses.length - 1];
          return lastResponse.textContent?.trim() || '';
        }

        // Fallback: get text from main area
        const main = document.querySelector('main');
        return main?.innerText.slice(-5000) || '';
      }, initialModelResponseCount);

      response.appendResponseLine('✅ 回答完了');

      // Always save/update session (not just for new chats)
      const chatUrl = page.url();
      const chatIdMatch = chatUrl.match(/\/app\/([a-f0-9]+)/);
      const currentChatId = chatIdMatch ? chatIdMatch[1] : null;

      if (currentChatId) {
        // Check if URL changed (Gemini redirected to new chat)
        const urlChanged = sessionChatId && currentChatId !== sessionChatId;
        if (urlChanged) {
          response.appendResponseLine(
            `⚠️ チャットIDが変更されました: ${sessionChatId} → ${currentChatId}`,
          );
          isNewChat = true;
        }

        // Load existing session to get conversation count
        const sessions = await loadChatSessions();
        const projectSessions = sessions[project] || [];
        const existingSession = projectSessions.find(
          s => s.chatId === currentChatId,
        );
        const newCount = (existingSession?.conversationCount || 0) + 1;

        await saveChatSession(project, {
          chatId: currentChatId,
          url: chatUrl,
          lastUsed: new Date().toISOString(),
          createdAt: existingSession?.createdAt || new Date().toISOString(),
          title: `[Project: ${project}]`,
          conversationCount: newCount,
        });
        sessionChatId = currentChatId;
      }

      // Save log with conversation number
      const finalSessions = await loadChatSessions();
      const finalProjectSessions = finalSessions[project] || [];
      const finalSession = finalProjectSessions.find(
        s => s.chatId === sessionChatId,
      );
      const conversationNumber = finalSession?.conversationCount || 1;

      const logPath = await saveConversationLog(
        project,
        sanitizedQuestion,
        responseText,
        {
          chatUrl: page.url(),
          chatId: sessionChatId,
          conversationNumber,
        },
      );

      response.appendResponseLine(`📝 会話ログ保存: ${logPath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // ケース分類：致命的エラーには明確なメッセージを表示
      const isFatalError =
        msg.includes('No page selected') ||
        msg.includes('page is null') ||
        msg.includes('Target closed') ||
        msg.includes('Session closed') ||
        msg.includes('Connection closed') ||
        msg.includes('Protocol error') ||
        msg.includes('Browser disconnected');

      if (msg.includes('No page selected') || msg.includes('page is null')) {
        response.appendResponseLine('❌ ブラウザタブがありません');
        response.appendResponseLine(
          '→ MCPサーバーを再起動してブラウザを開いてください',
        );
      } else if (
        msg.includes('Target closed') ||
        msg.includes('Session closed') ||
        msg.includes('Connection closed')
      ) {
        response.appendResponseLine('❌ ブラウザ接続が切れました');
        response.appendResponseLine('→ MCPサーバーを再起動してください');
      } else if (
        msg.includes('Protocol error') ||
        msg.includes('Browser disconnected')
      ) {
        response.appendResponseLine('❌ ブラウザとの通信エラー');
        response.appendResponseLine('→ MCPサーバーを再起動してください');
      } else {
        response.appendResponseLine(`❌ エラー: ${msg}`);
      }

      // Error snapshot（致命的エラーの場合はスキップ）
      if (!isFatalError) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const debugDir = path.join(process.cwd(), 'docs/ask/gemini/debug');
          await fs.promises.mkdir(debugDir, {recursive: true});

          const screenshotPath = path.join(
            debugDir,
            `error-${timestamp}.png`,
          ) as `${string}.png`;
          await page.screenshot({path: screenshotPath});
          response.appendResponseLine(
            `📸 エラー時のスクリーンショット: ${screenshotPath}`,
          );

          const htmlPath = path.join(debugDir, `error-${timestamp}.html`);
          const html = await page.content();
          await fs.promises.writeFile(htmlPath, html, 'utf-8');
          response.appendResponseLine(`📄 エラー時のHTML: ${htmlPath}`);
        } catch (snapshotError) {
          console.error('Failed to capture error snapshot:', snapshotError);
        }
      }
    }
  },
});
