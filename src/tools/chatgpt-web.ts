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
import {loadSelectors, getSelector} from '../selectors/loader.js';
import {CHATGPT_CONFIG} from '../config.js';
import {isLoginRequired} from '../login-helper.js';
import type {Page} from 'puppeteer-core';

/**
 * Wait for ChatGPT response completion using MutationObserver.
 * More reliable than polling for detecting when streaming ends.
 */
async function waitForChatGPTComplete(
  page: Page,
  options: {
    isDeepResearch?: boolean;
    silenceDuration?: number;
    timeout?: number;
    onProgress?: (status: {elapsed: number; text?: string; progress?: string}) => void;
  } = {},
): Promise<{
  completed: boolean;
  timedOut?: boolean;
  text?: string;
  thinkingTime?: number;
  isDeepResearch?: boolean;
}> {
  const {
    isDeepResearch = false,
    silenceDuration = 2000,
    timeout = 300000,
  } = options;

  const startTime = Date.now();

  // Use MutationObserver for completion detection
  const result = await page.evaluate(
    ({isDeepResearch, silenceDuration, timeout}) => {
      return new Promise<{
        completed: boolean;
        timedOut?: boolean;
        text?: string;
        thinkingTime?: number;
        isDeepResearch?: boolean;
      }>((resolve) => {
        const startTime = Date.now();
        let silenceTimeout: ReturnType<typeof setTimeout>;
        let overallTimeout: ReturnType<typeof setTimeout>;
        let lastCheckTime = 0;

        const checkCompletion = (): {
          isStreaming: boolean;
          text?: string;
          thinkingTime?: number;
        } => {
          const buttons = Array.from(document.querySelectorAll('button'));

          if (isDeepResearch) {
            // DeepResearch: check for stop button
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
              const assistantMessages = document.querySelectorAll(
                '[data-message-author-role="assistant"]',
              );
              if (assistantMessages.length > 0) {
                const latestMessage = assistantMessages[assistantMessages.length - 1];
                return {
                  isStreaming: false,
                  text: latestMessage.textContent || '',
                };
              }
            }
            return {isStreaming: true};
          }

          // Normal streaming: check for stop button
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
            const assistantMessages = document.querySelectorAll(
              '[data-message-author-role="assistant"]',
            );
            if (assistantMessages.length > 0) {
              const latestMessage = assistantMessages[assistantMessages.length - 1];
              const thinkingButton = latestMessage.querySelector(
                'button[aria-label*="思考時間"]',
              );
              const thinkingTime = thinkingButton
                ? parseInt(
                    (thinkingButton.textContent || '').match(/\d+/)?.[0] || '0',
                  )
                : undefined;

              return {
                isStreaming: false,
                text: latestMessage.textContent || '',
                thinkingTime,
              };
            }
          }

          return {isStreaming: true};
        };

        const handleSilence = () => {
          const status = checkCompletion();
          if (!status.isStreaming) {
            cleanup();
            resolve({
              completed: true,
              text: status.text,
              thinkingTime: status.thinkingTime,
              isDeepResearch,
            });
          }
          // Still streaming, wait for more changes
        };

        const cleanup = () => {
          clearTimeout(silenceTimeout);
          clearTimeout(overallTimeout);
          observer.disconnect();
        };

        // Observe the response container
        const responseContainer =
          document.querySelector('[role="main"]') || document.body;

        const observer = new MutationObserver(() => {
          // Reset silence timer on DOM change
          clearTimeout(silenceTimeout);

          // Throttle status checks to every 500ms
          const now = Date.now();
          if (now - lastCheckTime > 500) {
            lastCheckTime = now;
            const status = checkCompletion();
            if (!status.isStreaming) {
              // Give a small delay to ensure streaming is truly done
              silenceTimeout = setTimeout(handleSilence, silenceDuration);
            }
          } else {
            silenceTimeout = setTimeout(handleSilence, silenceDuration);
          }
        });

        // Overall timeout
        overallTimeout = setTimeout(() => {
          cleanup();
          const status = checkCompletion();
          resolve({
            completed: !status.isStreaming,
            timedOut: true,
            text: status.text,
            thinkingTime: status.thinkingTime,
            isDeepResearch,
          });
        }, timeout);

        // Start observing
        observer.observe(responseContainer, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        // Initial check - maybe already complete
        const initialStatus = checkCompletion();
        if (!initialStatus.isStreaming) {
          silenceTimeout = setTimeout(handleSilence, silenceDuration);
        }
      });
    },
    {isDeepResearch, silenceDuration, timeout},
  );

  return result;
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
      await page.goto(CHATGPT_CONFIG.DEFAULT_URL, {waitUntil: 'networkidle2'});

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
          await page.goto(latestSession.url, {waitUntil: 'networkidle2'});
          sessionChatId = latestSession.chatId;
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

      // Step 5: Wait for response using MutationObserver-based detection
      if (useDeepResearch) {
        response.appendResponseLine(
          'DeepResearchを実行中... (MutationObserverで完了を検出)',
        );
      } else {
        response.appendResponseLine(
          'ChatGPTの回答を待機中... (MutationObserverで完了を検出)',
        );
      }

      const startTime = Date.now();

      // Use MutationObserver-based completion detection
      const status = await waitForChatGPTComplete(page, {
        isDeepResearch: useDeepResearch,
        silenceDuration: 2000, // 2 seconds of DOM silence = complete
        timeout: 300000, // 5 minutes max
      });

      if (status.completed) {
        const completionMessage = useDeepResearch
          ? `\n✅ DeepResearch完了 (所要時間: ${Math.floor((Date.now() - startTime) / 1000)}秒)`
          : `\n✅ 回答完了 (所要時間: ${Math.floor((Date.now() - startTime) / 1000)}秒)`;
        response.appendResponseLine(completionMessage);

        if (status.timedOut) {
          response.appendResponseLine('⚠️ タイムアウトしましたが、回答を取得しました');
        }

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
      } else {
        response.appendResponseLine('❌ 回答の取得に失敗しました');
        if (status.timedOut) {
          response.appendResponseLine('⚠️ タイムアウトしました');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`❌ エラー: ${errorMessage}`);
    }
  },
});
