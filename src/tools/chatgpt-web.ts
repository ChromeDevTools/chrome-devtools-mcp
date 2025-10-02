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
  },
  handler: async (request, response, context) => {
    const {question, projectName, createNewChat = false} = request.params;

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

      // Step 2: Search for existing chat or create new one
      if (!createNewChat) {
        response.appendResponseLine(
          `既存のプロジェクトチャット「[Project: ${project}]」を検索中...`,
        );

        // Open search
        const searchOpened = await page.evaluate(() => {
          const searchButton = Array.from(
            document.querySelectorAll('div.group.__menu-item.hoverable'),
          ).find((elem) => elem.textContent?.includes('チャットを検索')) as
            | HTMLElement
            | undefined;
          if (searchButton) {
            searchButton.click();
            return true;
          }
          return false;
        });

        if (searchOpened) {
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Search for project chat
          const chatFound = await page.evaluate((projectName) => {
            const searchInput = document.querySelector(
              'input[placeholder*="チャットを検索"]',
            ) as HTMLInputElement;
            if (searchInput) {
              searchInput.value = `[Project: ${projectName}]`;
              searchInput.dispatchEvent(new Event('input', {bubbles: true}));
              return true;
            }
            return false;
          }, project);

          if (chatFound) {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Try to find and click the chat
            const existingChat = await page.evaluate((projectName) => {
              const chatLinks = Array.from(
                document.querySelectorAll('a[href^="/c/"]'),
              );
              const targetChat = chatLinks.find((link) =>
                link.textContent?.includes(`[Project: ${projectName}]`),
              );
              if (targetChat) {
                (targetChat as HTMLElement).click();
                return {
                  found: true,
                  href: (targetChat as HTMLAnchorElement).href,
                };
              }
              return {found: false};
            }, project);

            if (existingChat.found) {
              response.appendResponseLine(
                `✅ 既存チャットを使用: ${existingChat.href}`,
              );
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } else {
              response.appendResponseLine(
                '既存チャットが見つかりませんでした。新規作成します。',
              );
            }
          }
        }
      }

      // Step 3: Create new chat if needed
      let isNewChat = false;
      if (createNewChat || page.url() === 'https://chatgpt.com/') {
        response.appendResponseLine('新規チャットを作成中...');
        isNewChat = true;

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
        const buttons = Array.from(document.querySelectorAll('button'));
        const sendButton = buttons.find((btn) => {
          const svg = btn.querySelector('svg');
          return (
            svg &&
            !(btn as HTMLButtonElement).disabled &&
            btn.offsetParent !== null
          );
        });
        if (sendButton) {
          sendButton.click();
          return true;
        }
        return false;
      });

      if (!sent) {
        response.appendResponseLine('❌ 送信ボタンが見つかりません');
        return;
      }

      response.appendResponseLine('✅ 質問送信完了');

      // Step 5: Monitor streaming with progress updates
      response.appendResponseLine(
        'ChatGPTの回答を待機中... (10秒ごとに進捗を表示)',
      );

      const startTime = Date.now();
      let lastText = '';

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const status = await page.evaluate(() => {
          // Check if streaming
          const buttons = Array.from(document.querySelectorAll('button'));
          const isStreaming = buttons.some(
            (btn) =>
              btn.textContent?.includes('ストリーミングの停止') ||
              btn.textContent?.includes('停止'),
          );

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
        });

        if (status.completed) {
          response.appendResponseLine(
            `\n✅ 回答完了 (所要時間: ${Math.floor((Date.now() - startTime) / 1000)}秒)`,
          );
          if (status.thinkingTime) {
            response.appendResponseLine(
              `🤔 思考時間: ${status.thinkingTime}秒`,
            );
          }

          // Rename chat if it's a new chat
          if (isNewChat) {
            response.appendResponseLine('チャット名を変更中...');

            // Wait for chat to be created
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Click chat menu
            const menuClicked = await page.evaluate(() => {
              const menuButtons = Array.from(
                document.querySelectorAll(
                  'button[aria-label="会話のオプションを開く"]',
                ),
              ) as HTMLElement[];
              // Find the first menu button (current chat)
              const btn = menuButtons[0];
              if (btn) {
                btn.click();
                return true;
              }
              return false;
            });

            if (menuClicked) {
              await new Promise((resolve) => setTimeout(resolve, 500));

              // Click "名前を変更する"
              const renameClicked = await page.evaluate(() => {
                const menuItems = Array.from(
                  document.querySelectorAll('[role="menuitem"]'),
                );
                const renameItem = menuItems.find((item) =>
                  item.textContent?.includes('名前を変更する'),
                );
                if (renameItem) {
                  (renameItem as HTMLElement).click();
                  return true;
                }
                return false;
              });

              if (renameClicked) {
                await new Promise((resolve) => setTimeout(resolve, 500));

                // Enter new name
                await page.evaluate((projectName) => {
                  const textbox = document.querySelector(
                    'input[type="text"]',
                  ) as HTMLInputElement;
                  if (textbox) {
                    textbox.value = `[Project: ${projectName}]`;
                    textbox.dispatchEvent(
                      new Event('input', {bubbles: true}),
                    );
                    textbox.blur();
                  }
                }, project);

                await new Promise((resolve) => setTimeout(resolve, 500));
                response.appendResponseLine(
                  `✅ チャット名を「[Project: ${project}]」に変更`,
                );

                // Close the menu popup by clicking outside
                await page.evaluate(() => {
                  const body = document.body;
                  body.click();
                });
                await new Promise((resolve) => setTimeout(resolve, 300));
              }
            }
          }

          // Save conversation log
          const chatUrl = page.url();
          const logPath = await saveConversationLog(
            project,
            sanitizedQuestion,
            status.text || '',
            {
              thinkingTime: status.thinkingTime,
              chatUrl,
              model: 'ChatGPT 5 Thinking',
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`❌ エラー: ${errorMessage}`);
    }
  },
});
