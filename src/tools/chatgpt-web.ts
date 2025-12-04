/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import z from 'zod';
import type { Page } from 'puppeteer-core';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {loadSelectors, getSelector} from '../selectors/loader.js';
import {CHATGPT_CONFIG} from '../config.js';
import {isLoginRequired} from '../login-helper.js';

import type {Context} from './ToolDefinition.js';

/**
 * Navigate with retry logic for handling ERR_ABORTED and other network errors
 */
async function navigateWithRetry(
    page: Page,
    url: string,
    options: { waitUntil: 'networkidle2' | 'domcontentloaded' | 'load'; maxRetries?: number } = { waitUntil: 'networkidle2', maxRetries: 3 }
): Promise<void> {
    const { waitUntil, maxRetries = 3 } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.goto(url, { waitUntil, timeout: 30000 });
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
 * Find or create a dedicated ChatGPT tab
 * Returns existing ChatGPT tab if found, otherwise creates a new one
 * Also returns whether navigation is needed
 */
async function getOrCreateChatGPTPage(context: Context): Promise<{ page: Page; needsNavigation: boolean }> {
    // Refresh pages list
    await context.createPagesSnapshot();
    const pages = context.getPages();

    // Look for existing ChatGPT tab
    for (const page of pages) {
        const url = page.url();
        if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
            // Already on ChatGPT - no navigation needed
            return { page, needsNavigation: false };
        }
    }

    // No ChatGPT tab found, create a new one
    const newPage = await context.newPage();
    return { page: newPage, needsNavigation: true };
}

/**
 * Path to store chat session data
 */
const CHAT_SESSIONS_FILE = path.join(
  process.cwd(),
  'docs/ask/chatgpt/.chat-sessions.json',
);

interface ChatSession {
  chatId: string;
  url: string;
  lastUsed: string;
  title?: string;
  createdAt: string;
  conversationCount?: number;
}

interface ChatSessions {
  [projectName: string]: ChatSession[];
}

/**
 * Load chat sessions from JSON file with backward compatibility
 */
async function loadChatSessions(): Promise<ChatSessions> {
  try {
    const data = await fs.promises.readFile(CHAT_SESSIONS_FILE, 'utf-8');
    const parsed = JSON.parse(data);

    // Migrate from old format (single object) to new format (array)
    const migrated: ChatSessions = {};
    for (const [projectName, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        // Already in new format
        migrated[projectName] = value as ChatSession[];
      } else {
        // Old format - convert to array
        const oldSession = value as any;
        migrated[projectName] = [{
          chatId: oldSession.chatId,
          url: oldSession.url,
          lastUsed: oldSession.lastUsed,
          title: oldSession.title,
          createdAt: oldSession.lastUsed, // Use lastUsed as createdAt for old sessions
          conversationCount: 1,
        }];
      }
    }

    return migrated;
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

  // Initialize project array if it doesn't exist
  if (!sessions[projectName]) {
    sessions[projectName] = [];
  }

  // Check if session with same chatId already exists
  const existingIndex = sessions[projectName].findIndex(
    s => s.chatId === session.chatId
  );

  if (existingIndex >= 0) {
    // Update existing session
    sessions[projectName][existingIndex] = {
      ...sessions[projectName][existingIndex],
      ...session,
      lastUsed: new Date().toISOString(),
    };
  } else {
    // Add new session to array
    sessions[projectName].push({
      ...session,
      createdAt: session.createdAt || new Date().toISOString(),
    });
  }

  // Ensure directory exists
  const dir = path.dirname(CHAT_SESSIONS_FILE);
  await fs.promises.mkdir(dir, {recursive: true});

  await fs.promises.writeFile(
    CHAT_SESSIONS_FILE,
    JSON.stringify(sessions, null, 2),
    'utf-8',
  );
}

/**
 * Sanitize question to remove sensitive information like passwords
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
 * Save conversation log to docs/ask/chatgpt/
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
  // Generate timestamp in yymmdd_HHMMSS format
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

  // Generate topic slug from first 50 characters
  const topicSlug = question
    .substring(0, 50)
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/gi, '-')
    .toLowerCase()
    .slice(0, 30);

  // If chatId is provided, save in chat-specific folder
  let logPath: string;
  if (metadata.chatId) {
    const conversationNum = String(metadata.conversationNumber || 1).padStart(3, '0');
    const filename = `${conversationNum}-${timestamp}-${topicSlug}.md`;
    const logDir = path.join('docs/ask/chatgpt', metadata.chatId);
    logPath = path.join(process.cwd(), logDir, filename);

    // Ensure chat directory exists
    await fs.promises.mkdir(path.join(process.cwd(), logDir), {recursive: true});
  } else {
    // Fallback to old format (flat structure)
    const filename = `${timestamp}-${projectName}-${topicSlug}.md`;
    const logDir = 'docs/ask/chatgpt';
    logPath = path.join(process.cwd(), logDir, filename);

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(logPath), {recursive: true});
  }

  const content = `# ${topicSlug}

## 📅 メタ情報
- **日時**: ${now.toLocaleString('ja-JP')}
- **プロジェクト**: ${projectName}
- **AIモデル**: ${metadata.model || 'ChatGPT'}
${metadata.chatId ? `- **チャットID**: ${metadata.chatId}\n` : ''}${metadata.conversationNumber ? `- **会話番号**: ${metadata.conversationNumber}\n` : ''}${metadata.thinkingTime ? `- **思考時間**: ${metadata.thinkingTime}s\n` : ''}${metadata.chatUrl ? `- **チャットURL**: ${metadata.chatUrl}\n` : ''}
## ❓ 質問

${question}

## 💬 回答

${response}
`;

  await fs.promises.writeFile(logPath, content, 'utf-8');
  return path.relative(process.cwd(), logPath);
}

export const askChatGPTWeb = defineTool({
  name: 'ask_chatgpt_web',
  description: 'Ask ChatGPT via browser. Logs to docs/ask/chatgpt/.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    question: z
      .string()
      .describe('Question text'),
    projectName: z
      .string()
      .optional()
      .describe('Project name (default: cwd)'),
    createNewChat: z
      .boolean()
      .optional()
      .describe('Force new chat'),
    useDeepResearch: z
      .boolean()
      .optional()
      .describe('Enable DeepResearch mode'),
  },
  handler: async (request, response, context) => {
    const {question, projectName, createNewChat = false, useDeepResearch = false} = request.params;

    // Sanitize question
    const sanitizedQuestion = sanitizeQuestion(question);

    // Determine project name
    const project =
      projectName || path.basename(process.cwd()) || 'unknown-project';

    // Get or create a dedicated ChatGPT tab
    const { page, needsNavigation } = await getOrCreateChatGPTPage(context);

    try {
      // Step 1: Navigate to ChatGPT (only if not already there)
      response.appendResponseLine('ChatGPTに接続中...');
      if (needsNavigation) {
        await navigateWithRetry(page, CHATGPT_CONFIG.DEFAULT_URL, {waitUntil: 'networkidle2'});
        // Wait for page to fully render (ChatGPT takes time to load UI)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        response.appendResponseLine('✅ 既存のChatGPTタブを再利用');
      }

      // Step 2: Check if login is required (don't wait - stop immediately)
      const needsLogin = await isLoginRequired(page);

      if (needsLogin) {
        response.appendResponseLine('\n❌ ChatGPTへのログインが必要です');
        response.appendResponseLine('');
        response.appendResponseLine('📱 ブラウザウィンドウでChatGPTにログインしてください：');
        response.appendResponseLine('   1. ブラウザウィンドウの「ログイン」ボタンをクリック');
        response.appendResponseLine('   2. メールアドレスまたはGoogleアカウントでログイン');
        response.appendResponseLine('   3. ログイン完了後、このツールを再実行してください');
        response.appendResponseLine('');
        return;
      }

      response.appendResponseLine('✅ ログイン確認完了');

      // Step 2: Load existing session or create new chat
      let isNewChat = false;
      let sessionChatId: string | undefined;

      if (!createNewChat) {
        // Try to load existing session for this project
        const sessions = await loadChatSessions();
        const projectSessions = sessions[project] || [];

        if (projectSessions.length > 0) {
          // Get the most recently used session
          const sortedSessions = [...projectSessions].sort(
            (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
          );
          const latestSession = sortedSessions[0];

          response.appendResponseLine(
            `既存のプロジェクトチャットを使用: ${latestSession.url}`,
          );
          await navigateWithRetry(page, latestSession.url, {waitUntil: 'networkidle2'});
          sessionChatId = latestSession.chatId;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          response.appendResponseLine(
            '既存チャットが見つかりませんでした。新規作成します。',
          );
          isNewChat = true;
        }
      } else {
        isNewChat = true;
      }

      // Step 3: Create new chat if needed
      if (isNewChat) {
        response.appendResponseLine('新規チャットを作成中...');

        // Click "新しいチャット"
        await page.evaluate(() => {
          const newChatLink = document.querySelector('a[href="/"]');
          if (newChatLink) {
            (newChatLink as HTMLElement).click();
          }
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Turn off temporary chat
        const tempChatDisabled = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find((b) => {
            const label = b.getAttribute('aria-label') || '';
            return label.includes('一時チャットをオフにする');
          });
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });

        if (tempChatDisabled) {
          response.appendResponseLine('✅ 一時チャットを無効化');
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Step 3.5: Enable DeepResearch mode if requested
      if (useDeepResearch) {
        response.appendResponseLine('DeepResearchモードを有効化中...');

        // Click the "+" button to open tools menu
        const menuOpened = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const plusButton = buttons.find((btn) => {
            const aria = btn.getAttribute('aria-label') || '';
            const desc = btn.getAttribute('description') || '';
            return (
              aria.includes('ファイルの追加') ||
              desc.includes('ファイルの追加')
            );
          });
          if (plusButton) {
            (plusButton as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (menuOpened) {
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Click "Deep Research" menu item
          const deepResearchEnabled = await page.evaluate(() => {
            const menuItems = Array.from(
              document.querySelectorAll('[role="menuitemradio"]'),
            );
            const deepResearchItem = menuItems.find((item) =>
              item.textContent?.includes('Deep Research'),
            );
            if (deepResearchItem) {
              (deepResearchItem as HTMLElement).click();
              return true;
            }
            return false;
          });

          if (deepResearchEnabled) {
            response.appendResponseLine('✅ DeepResearchモード有効化完了');
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Verify mode was actually enabled (check for new UI indicators)
            const selectors = loadSelectors();
            const verification = await page.evaluate((deleteText, sourcesText, deepResearchPlaceholders) => {
              // Check placeholder text
              const textarea = document.querySelector('textarea');
              const placeholder = textarea?.getAttribute('placeholder') || '';

              // Check for delete button (using JSON selector)
              const deleteButton = Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent?.includes(deleteText)
              );

              // Check for sources button (using JSON selector)
              const sourcesButton = Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent?.includes(sourcesText)
              );

              // Check placeholder against expected patterns
              const hasCorrectPlaceholder = deepResearchPlaceholders.some((pattern: string) =>
                placeholder.includes(pattern)
              );

              return {
                hasCorrectPlaceholder,
                hasDeleteButton: !!deleteButton,
                hasSourcesButton: !!sourcesButton,
                placeholder: placeholder
              };
            },
            getSelector('deepResearchDeleteButton').text as string,
            getSelector('deepResearchSourcesButton').text as string,
            Array.isArray(selectors.placeholders?.deepResearchMode)
              ? selectors.placeholders.deepResearchMode
              : [selectors.placeholders?.deepResearchMode || '']
            );

            if (verification.hasCorrectPlaceholder || verification.hasDeleteButton) {
              response.appendResponseLine('✅ モード確認完了: DeepResearch有効');
            } else {
              response.appendResponseLine(
                `⚠️ DeepResearchモードの確認に失敗しました（placeholder: ${verification.placeholder}）`,
              );
            }
          } else {
            response.appendResponseLine(
              '⚠️ DeepResearchオプションが見つかりませんでした',
            );
          }
        }
      }

      // Step 4: Send question (with final mode verification)
      if (useDeepResearch) {
        const selectorsForCheck = loadSelectors();
        const finalCheck = await page.evaluate((deleteText, deepResearchPlaceholders) => {
          // Check placeholder text
          const textarea = document.querySelector('textarea');
          const placeholder = textarea?.getAttribute('placeholder') || '';

          // Check for delete button (using JSON selector)
          const deleteButton = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.textContent?.includes(deleteText)
          );

          // Check if placeholder matches DeepResearch patterns
          const placeholderMatches = deepResearchPlaceholders.some((pattern: string) =>
            placeholder.includes(pattern)
          );

          return {
            isEnabled: placeholderMatches || !!deleteButton,
            placeholder: placeholder
          };
        },
        getSelector('deepResearchDeleteButton').text as string,
        Array.isArray(selectorsForCheck.placeholders?.deepResearchMode)
          ? selectorsForCheck.placeholders.deepResearchMode
          : [selectorsForCheck.placeholders?.deepResearchMode || '']
        );

        if (!finalCheck.isEnabled) {
          response.appendResponseLine(
            `❌ エラー: DeepResearchモードが無効です。送信を中止します。（placeholder: ${finalCheck.placeholder}）`,
          );
          return;
        }
        response.appendResponseLine('✅ 送信前確認: DeepResearchモード有効');
      }

      response.appendResponseLine('質問を送信中...');

      const questionSent = await page.evaluate((questionText) => {
        const prosemirror = document.querySelector(
          '.ProseMirror[contenteditable="true"]',
        ) as HTMLElement;
        if (!prosemirror) return false;

        prosemirror.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = questionText;
        prosemirror.appendChild(p);
        prosemirror.dispatchEvent(new Event('input', {bubbles: true}));

        return true;
      }, sanitizedQuestion);

      if (!questionSent) {
        response.appendResponseLine('❌ エディタが見つかりません');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Click send button
      const sent = await page.evaluate(() => {
        const sendButton = document.querySelector(
          'button[data-testid="send-button"]',
        ) as HTMLButtonElement;
        if (sendButton && !sendButton.disabled) {
          sendButton.click();
          return true;
        }
        return false;
      });

      if (!sent) {
        response.appendResponseLine('❌ 送信ボタンが見つかりません');
        return;
      }

      // Wait for message to actually be sent (user message appears in DOM)
      await page.waitForFunction(
        () => {
          const messages = document.querySelectorAll(
            '[data-message-author-role="user"]',
          );
          return messages.length > 0;
        },
        {timeout: 10000},
      );

      response.appendResponseLine('✅ 質問送信完了');

      // Step 5: Monitor streaming/research with progress updates
      if (useDeepResearch) {
        response.appendResponseLine(
          'DeepResearchを実行中... (10秒ごとに進捗を表示)',
        );
      } else {
        response.appendResponseLine(
          'ChatGPTの回答を待機中... (10秒ごとに進捗を表示)',
        );
      }

      const startTime = Date.now();
      let lastText = '';
      let lastProgress = '';

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const status = await page.evaluate((isDeepResearch) => {
          // DeepResearch progress detection
          if (isDeepResearch) {
            // Look for research progress indicators
            const progressElements = Array.from(
              document.querySelectorAll('[role="status"], [aria-live="polite"]'),
            );
            const progressText = progressElements
              .map((el) => el.textContent)
              .join(' ');

            // Check if DeepResearch is still running
            const buttons = Array.from(document.querySelectorAll('button'));
            const isRunning = buttons.some((btn) => {
              const text = btn.textContent || '';
              const aria = btn.getAttribute('aria-label') || '';
              return (
                text.includes('停止') ||
                text.includes('リサーチを停止') ||
                aria.includes('停止')
              );
            });

            if (!isRunning) {
              // Research completed - get the report
              const assistantMessages = document.querySelectorAll(
                '[data-message-author-role="assistant"]',
              );
              if (assistantMessages.length === 0)
                return {completed: false, progress: progressText};

              const latestMessage =
                assistantMessages[assistantMessages.length - 1];
              return {
                completed: true,
                text: latestMessage.textContent || '',
                isDeepResearch: true,
              };
            }

            return {
              completed: false,
              streaming: true,
              progress: progressText,
              currentText: progressText.substring(0, 200),
            };
          }

          // Normal streaming detection
          const buttons = Array.from(document.querySelectorAll('button'));
          const isStreaming = buttons.some((btn) => {
            const text = btn.textContent || '';
            const aria = btn.getAttribute('aria-label') || '';
            return (
              text.includes('ストリーミングの停止') ||
              text.includes('停止') ||
              aria.includes('ストリーミングの停止') ||
              aria.includes('停止')
            );
          });

          if (!isStreaming) {
            // Get final response
            const assistantMessages = document.querySelectorAll(
              '[data-message-author-role="assistant"]',
            );
            if (assistantMessages.length === 0) return {completed: false};

            const latestMessage =
              assistantMessages[assistantMessages.length - 1];
            const thinkingButton = latestMessage.querySelector(
              'button[aria-label*="思考時間"]',
            );
            const thinkingTime = thinkingButton
              ? parseInt(
                  (thinkingButton.textContent || '').match(/\d+/)?.[0] || '0',
                )
              : undefined;

            return {
              completed: true,
              text: latestMessage.textContent || '',
              thinkingTime,
            };
          }

          // Get current text
          const assistantMessages = document.querySelectorAll(
            '[data-message-author-role="assistant"]',
          );
          const latestMessage =
            assistantMessages[assistantMessages.length - 1];
          const currentText = latestMessage
            ? latestMessage.textContent?.substring(0, 200)
            : '';

          return {
            completed: false,
            streaming: true,
            currentText,
          };
        }, useDeepResearch);

        if (status.completed) {
          const completionMessage = useDeepResearch
            ? `\n✅ DeepResearch完了 (所要時間: ${Math.floor((Date.now() - startTime) / 1000)}秒)`
            : `\n✅ 回答完了 (所要時間: ${Math.floor((Date.now() - startTime) / 1000)}秒)`;
          response.appendResponseLine(completionMessage);

          if (status.thinkingTime) {
            response.appendResponseLine(
              `🤔 思考時間: ${status.thinkingTime}秒`,
            );
          }

          // Save chat session if it's a new chat
          if (isNewChat) {
            response.appendResponseLine('チャットセッションを保存中...');

            // Extract chat ID from URL
            const chatUrl = page.url();
            const chatIdMatch = chatUrl.match(/\/c\/([a-f0-9-]+)/);

            if (chatIdMatch) {
              const chatId = chatIdMatch[1];
              const now = new Date().toISOString();
              await saveChatSession(project, {
                chatId,
                url: chatUrl,
                lastUsed: now,
                createdAt: now,
                title: `[Project: ${project}]`,
                conversationCount: 1,
              });
              sessionChatId = chatId;
              response.appendResponseLine(
                `✅ チャットセッション保存: ${chatId}`,
              );
            } else {
              response.appendResponseLine(
                '⚠️ チャットIDが取得できませんでした',
              );
            }
          } else {
            // Update last used timestamp and conversation count for existing session
            if (sessionChatId) {
              const chatUrl = page.url();
              const sessions = await loadChatSessions();
              const projectSessions = sessions[project] || [];
              const existingSession = projectSessions.find(s => s.chatId === sessionChatId);

              await saveChatSession(project, {
                chatId: sessionChatId,
                url: chatUrl,
                lastUsed: new Date().toISOString(),
                createdAt: existingSession?.createdAt || new Date().toISOString(),
                title: existingSession?.title || `[Project: ${project}]`,
                conversationCount: (existingSession?.conversationCount || 0) + 1,
              });
            }
          }

          // Save conversation log
          const chatUrl = page.url();
          const modelName = useDeepResearch
            ? 'ChatGPT DeepResearch'
            : 'ChatGPT 5 Thinking';

          // Get current conversation count
          const sessions = await loadChatSessions();
          const projectSessions = sessions[project] || [];
          const currentSession = projectSessions.find(s => s.chatId === sessionChatId);
          const conversationNum = currentSession?.conversationCount || 1;

          const logPath = await saveConversationLog(
            project,
            sanitizedQuestion,
            status.text || '',
            {
              thinkingTime: status.thinkingTime,
              chatUrl,
              model: modelName,
              chatId: sessionChatId,
              conversationNumber: conversationNum,
            },
          );

          response.appendResponseLine(`📝 会話ログ保存: ${logPath}`);
          response.appendResponseLine(`🔗 チャットURL: ${chatUrl}`);
          response.appendResponseLine('\n' + '='.repeat(60));
          response.appendResponseLine('ChatGPTの回答:\n');
          response.appendResponseLine(status.text || '');

          break;
        }

        // Show progress every 10 seconds
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        if (elapsedSeconds % 10 === 0) {
          if (useDeepResearch && status.progress !== lastProgress) {
            lastProgress = status.progress || '';
            response.appendResponseLine(
              `⏱️ ${elapsedSeconds}秒経過 - 進捗: ${lastProgress.substring(0, 100)}...`,
            );
          } else if (status.currentText !== lastText) {
            lastText = status.currentText || '';
            response.appendResponseLine(
              `⏱️ ${elapsedSeconds}秒経過 - 現在のテキスト: ${lastText.substring(0, 100)}...`,
            );
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`❌ エラー: ${errorMessage}`);
    }
  },
});
