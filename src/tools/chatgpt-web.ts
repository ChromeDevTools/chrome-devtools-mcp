/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

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
}

interface ChatSessions {
  [projectName: string]: ChatSession;
}

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
  sessions[projectName] = session;

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

  const filename = `${timestamp}-${projectName}-${topicSlug}.md`;
  const logDir = 'docs/ask/chatgpt';
  const logPath = path.join(process.cwd(), logDir, filename);

  // Ensure directory exists
  await fs.promises.mkdir(path.dirname(logPath), {recursive: true});

  const content = `# ${topicSlug}

## 📅 メタ情報
- **日時**: ${now.toLocaleString('ja-JP')}
- **プロジェクト**: ${projectName}
- **AIモデル**: ${metadata.model || 'ChatGPT'}
${metadata.thinkingTime ? `- **思考時間**: ${metadata.thinkingTime}s\n` : ''}${metadata.chatUrl ? `- **チャットURL**: ${metadata.chatUrl}\n` : ''}
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
  description: `Ask ChatGPT a question via web browser automation. Claude can use this to consult ChatGPT for additional AI perspectives during development. Conversations are organized by project name and logged to docs/ask/chatgpt/.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    question: z
      .string()
      .describe(
        'The question to ask ChatGPT. Should be detailed and well-formed for best results.',
      ),
    projectName: z
      .string()
      .optional()
      .describe(
        'Project name for organizing conversations. Defaults to current working directory name.',
      ),
    createNewChat: z
      .boolean()
      .optional()
      .describe(
        'Force creation of a new chat instead of reusing existing project chat. Default: false',
      ),
    useDeepResearch: z
      .boolean()
      .optional()
      .describe(
        'Enable DeepResearch mode for complex research tasks requiring comprehensive analysis. ' +
          'Use when the question involves market research, comparative analysis, trend analysis, ' +
          'or requires gathering information from multiple sources. Default: false',
      ),
  },
  handler: async (request, response, context) => {
    const {question, projectName, createNewChat = false, useDeepResearch = false} = request.params;

    // Sanitize question
    const sanitizedQuestion = sanitizeQuestion(question);

    // Determine project name
    const project =
      projectName || path.basename(process.cwd()) || 'unknown-project';

    const page = context.getSelectedPage();

    try {
      // Step 1: Navigate to ChatGPT
      response.appendResponseLine('ChatGPTに接続中...');
      await page.goto('https://chatgpt.com/', {waitUntil: 'networkidle2'});

      // Check if logged in
      const currentUrl = page.url();
      if (currentUrl.includes('auth') || currentUrl.includes('login')) {
        response.appendResponseLine(
          '❌ ChatGPTにログインが必要です。ブラウザで手動ログインしてください。',
        );
        response.appendResponseLine(`ログインURL: ${currentUrl}`);
        return;
      }

      response.appendResponseLine('✅ ログイン確認完了');

      // Step 2: Load existing session or create new chat
      let isNewChat = false;
      let sessionChatId: string | undefined;

      if (!createNewChat) {
        // Try to load existing session for this project
        const sessions = await loadChatSessions();
        const existingSession = sessions[project];

        if (existingSession) {
          response.appendResponseLine(
            `既存のプロジェクトチャットを使用: ${existingSession.url}`,
          );
          await page.goto(existingSession.url, {waitUntil: 'networkidle2'});
          sessionChatId = existingSession.chatId;
          await new Promise((resolve) => setTimeout(resolve, 1000));
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
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else {
            response.appendResponseLine(
              '⚠️ DeepResearchオプションが見つかりませんでした',
            );
          }
        }
      }

      // Step 4: Send question
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
              await saveChatSession(project, {
                chatId,
                url: chatUrl,
                lastUsed: new Date().toISOString(),
                title: `[Project: ${project}]`,
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
            // Update last used timestamp for existing session
            if (sessionChatId) {
              const chatUrl = page.url();
              await saveChatSession(project, {
                chatId: sessionChatId,
                url: chatUrl,
                lastUsed: new Date().toISOString(),
                title: `[Project: ${project}]`,
              });
            }
          }

          // Save conversation log
          const chatUrl = page.url();
          const modelName = useDeepResearch
            ? 'ChatGPT DeepResearch'
            : 'ChatGPT 5 Thinking';
          const logPath = await saveConversationLog(
            project,
            sanitizedQuestion,
            status.text || '',
            {
              thinkingTime: status.thinkingTime,
              chatUrl,
              model: modelName,
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
