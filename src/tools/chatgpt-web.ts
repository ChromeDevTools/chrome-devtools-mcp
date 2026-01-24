/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import type {Page} from 'puppeteer-core';
import z from 'zod';

import {CHATGPT_CONFIG} from '../config.js';
import {
  getLoginStatus,
  waitForLoginStatus,
  LoginStatus,
} from '../login-helper.js';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import type {Context} from './ToolDefinition.js';

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
 * Find or create a dedicated ChatGPT tab
 * Returns existing ChatGPT tab if found, otherwise creates a new one
 * Also returns whether navigation is needed
 */
async function getOrCreateChatGPTPage(
  context: Context,
): Promise<{page: Page; needsNavigation: boolean}> {
  // Refresh pages list
  await context.createPagesSnapshot();
  const pages = context.getPages();

  // Look for existing ChatGPT tab
  for (const page of pages) {
    const url = page.url();
    if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
      // Already on ChatGPT - bring to front and no navigation needed
      await page.bringToFront();
      return {page, needsNavigation: false};
    }
  }

  // No ChatGPT tab found, create a new one
  const newPage = await context.newPage();
  return {page: newPage, needsNavigation: true};
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

type ChatSessions = Record<string, ChatSession[]>;

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
        migrated[projectName] = [
          {
            chatId: oldSession.chatId,
            url: oldSession.url,
            lastUsed: oldSession.lastUsed,
            title: oldSession.title,
            createdAt: oldSession.lastUsed, // Use lastUsed as createdAt for old sessions
            conversationCount: 1,
          },
        ];
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
    s => s.chatId === session.chatId,
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
    const conversationNum = String(metadata.conversationNumber || 1).padStart(
      3,
      '0',
    );
    const filename = `${conversationNum}-${timestamp}-${topicSlug}.md`;
    const logDir = path.join('docs/ask/chatgpt', metadata.chatId);
    logPath = path.join(process.cwd(), logDir, filename);

    // Ensure chat directory exists
    await fs.promises.mkdir(path.join(process.cwd(), logDir), {
      recursive: true,
    });
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
  description:
    'Ask ChatGPT via browser. Logs to docs/ask/chatgpt/. ' +
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

    // Sanitize question
    const sanitizedQuestion = sanitizeQuestion(question);

    // Determine project name
    const project =
      projectName || path.basename(process.cwd()) || 'unknown-project';

    // Get or create a dedicated ChatGPT tab
    const {page, needsNavigation} = await getOrCreateChatGPTPage(context);

    try {
      // Step 1: Determine target URL (existing session or top page)
      response.appendResponseLine('ChatGPTに接続中...');

      let isNewChat = false;
      let sessionChatId: string | undefined;
      let targetUrl: string = CHATGPT_CONFIG.DEFAULT_URL;

      if (!createNewChat) {
        // Check for existing session first
        const sessions = await loadChatSessions();
        const projectSessions = sessions[project] || [];

        if (projectSessions.length > 0) {
          // Get the most recently used session
          const sortedSessions = [...projectSessions].sort(
            (a, b) =>
              new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime(),
          );
          const latestSession = sortedSessions[0];
          sessionChatId = latestSession.chatId;
          targetUrl = latestSession.url;
          response.appendResponseLine(
            `既存のプロジェクトチャットを使用: ${latestSession.url}`,
          );
        } else {
          response.appendResponseLine('📝 新規チャットを作成します');
          isNewChat = true;
        }
      } else {
        isNewChat = true;
      }

      // Step 2: Navigate to target URL (skip if already there)
      const currentUrl = page.url();
      const isAlreadyOnTarget = sessionChatId
        ? currentUrl.includes(sessionChatId)
        : currentUrl.includes('chatgpt.com') && !needsNavigation;

      if (!isAlreadyOnTarget) {
        await navigateWithRetry(page, targetUrl, {
          waitUntil: 'networkidle2',
        });
        // Wait for page to fully render
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        response.appendResponseLine('✅ 既存のChatGPTタブを再利用');
      }

      // Step 3: Check login status
      const loginStatus = await getLoginStatus(page, 'chatgpt');

      if (loginStatus === LoginStatus.NEEDS_LOGIN) {
        response.appendResponseLine('\n🔐 ログインが必要です');
        response.appendResponseLine(
          '📱 ブラウザウィンドウを開きました。ログインしてください',
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
          'chatgpt',
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
        // Wait and retry with exponential backoff (login may still be processing)
        let retryStatus = LoginStatus.IN_PROGRESS;
        const maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
          const waitTime = 3000 + i * 2000; // 3s, 5s, 7s
          await new Promise(r => setTimeout(r, waitTime));
          retryStatus = await getLoginStatus(page, 'chatgpt');
          if (retryStatus === LoginStatus.LOGGED_IN) {
            break;
          }
          if (i < maxRetries - 1) {
            response.appendResponseLine(
              `⏳ ログイン処理中... (${i + 1}/${maxRetries})`,
            );
          }
        }
        if (retryStatus !== LoginStatus.LOGGED_IN) {
          response.appendResponseLine(
            '⚠️ ログイン状態を確認できませんでした。再試行してください。',
          );
          return;
        }
      }

      response.appendResponseLine('✅ ログイン確認完了');

      // Step 4: Wait for input field (for existing sessions)
      if (sessionChatId) {
        let inputFieldReady = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await page.waitForSelector(
              '.ProseMirror[contenteditable="true"]',
              {timeout: 5000},
            );
            inputFieldReady = true;
            break;
          } catch {
            if (attempt < 2) {
              response.appendResponseLine(
                `⏳ 入力欄を待機中... (${attempt + 1}/3)`,
              );
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
        if (!inputFieldReady) {
          response.appendResponseLine(
            '⚠️ 入力欄の準備に時間がかかっています。続行を試みます...',
          );
        }
      }

      // Step 5: Create new chat if needed
      if (isNewChat) {
        response.appendResponseLine('新規チャットを作成中...');

        // Click "新しいチャット"
        await page.evaluate(() => {
          const newChatLink = document.querySelector('a[href="/"]');
          if (newChatLink) {
            (newChatLink as HTMLElement).click();
          }
        });

        await new Promise(resolve => setTimeout(resolve, 300));

        // Turn off temporary chat
        const tempChatDisabled = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => {
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
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Capture initial message counts BEFORE sending
      // This is critical to detect if our message was actually sent
      const initialCounts = await page.evaluate(() => {
        const userMessages = document.querySelectorAll(
          '[data-message-author-role="user"]',
        );
        const assistantMessages = document.querySelectorAll(
          '[data-message-author-role="assistant"]',
        );
        return {
          userCount: userMessages.length,
          assistantCount: assistantMessages.length,
        };
      });
      const initialUserMsgCount = initialCounts.userCount;
      const initialAssistantMsgCount = initialCounts.assistantCount;

      // Step 4: Send question with retry
      response.appendResponseLine('質問を送信中...');

      let questionSent = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        questionSent = await page.evaluate(questionText => {
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

        if (questionSent) break;

        if (attempt < 2) {
          response.appendResponseLine(
            `⏳ 入力欄が見つかりません。再試行中... (${attempt + 1}/3)`,
          );
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!questionSent) {
        response.appendResponseLine(
          '❌ 入力欄が見つかりません（ページ読み込み中の可能性）',
        );
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 100));

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

      // Wait for message to actually be sent (user message count INCREASED)
      // This ensures we detect our NEW message, not existing ones
      await page.waitForFunction(
        initialCount => {
          const messages = document.querySelectorAll(
            '[data-message-author-role="user"]',
          );
          return messages.length > initialCount;
        },
        {timeout: 10000},
        initialUserMsgCount,
      );

      response.appendResponseLine('✅ 質問送信完了');

      // Step 5: Monitor streaming with progress updates
      response.appendResponseLine(
        'ChatGPTの回答を待機中... (10秒ごとに進捗を表示)',
      );

      const startTime = Date.now();
      let lastText = '';
      let isFirstCheck = true;

      while (true) {
        // First check is immediate, then poll every 500ms
        if (!isFirstCheck) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        isFirstCheck = false;

        const status = await page.evaluate(initialAssistantCount => {
          // Streaming detection - check for stop button by data-testid
          // When ChatGPT is generating, send-button becomes stop-button
          const stopButton = document.querySelector(
            'button[data-testid="stop-button"]',
          );
          const isStreaming = !!stopButton;

          if (!isStreaming) {
            // Get final response - only look at NEW messages
            const assistantMessages = document.querySelectorAll(
              '[data-message-author-role="assistant"]',
            );
            // Check if we have a NEW assistant message (not old ones)
            if (assistantMessages.length <= initialAssistantCount) {
              return {completed: false};
            }

            // Get the NEW message (first one after initial count)
            const newMessage = assistantMessages[initialAssistantCount];
            const thinkingButton = newMessage.querySelector(
              'button[aria-label*="思考時間"]',
            );
            const thinkingTime = thinkingButton
              ? parseInt(
                  (thinkingButton.textContent || '').match(/\d+/)?.[0] || '0',
                )
              : undefined;

            return {
              completed: true,
              text: newMessage.textContent || '',
              thinkingTime,
            };
          }

          // Get current text from NEW message during streaming
          const assistantMessages = document.querySelectorAll(
            '[data-message-author-role="assistant"]',
          );
          // Only check new messages
          const newMessage =
            assistantMessages.length > initialAssistantCount
              ? assistantMessages[initialAssistantCount]
              : null;
          const currentText = newMessage
            ? newMessage.textContent?.substring(0, 200)
            : '';

          return {
            completed: false,
            streaming: true,
            currentText,
          };
        }, initialAssistantMsgCount);

        if (status.completed) {
          response.appendResponseLine(
            `\n✅ 回答完了 (所要時間: ${Math.floor((Date.now() - startTime) / 1000)}秒)`,
          );

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
              const existingSession = projectSessions.find(
                s => s.chatId === sessionChatId,
              );

              await saveChatSession(project, {
                chatId: sessionChatId,
                url: chatUrl,
                lastUsed: new Date().toISOString(),
                createdAt:
                  existingSession?.createdAt || new Date().toISOString(),
                title: existingSession?.title || `[Project: ${project}]`,
                conversationCount:
                  (existingSession?.conversationCount || 0) + 1,
              });
            }
          }

          // Save conversation log
          const chatUrl = page.url();
          const modelName = 'ChatGPT';

          // Get current conversation count
          const sessions = await loadChatSessions();
          const projectSessions = sessions[project] || [];
          const currentSession = projectSessions.find(
            s => s.chatId === sessionChatId,
          );
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
        if (elapsedSeconds % 10 === 0 && status.currentText !== lastText) {
          lastText = status.currentText || '';
          response.appendResponseLine(
            `⏱️ ${elapsedSeconds}秒経過 - 現在のテキスト: ${lastText.substring(0, 100)}...`,
          );
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // ケース分類：致命的エラーには明確なメッセージを表示
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
    }
  },
});
