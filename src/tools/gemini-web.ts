/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import z from 'zod';
import type { Page } from 'puppeteer-core';

import { ToolCategories } from './categories.js';
import { defineTool } from './ToolDefinition.js';
import { loadGeminiSelectors, getGeminiSelector } from '../selectors/loader.js';
import { GEMINI_CONFIG } from '../config.js';
import { isLoginRequired } from '../login-helper.js';

/**
 * Wait for Gemini response completion using hybrid polling + stability check.
 * Polls every 1 second, and confirms completion when response is stable for 2 seconds.
 */
async function waitForGeminiComplete(
  page: Page,
  options: {
    timeout?: number;
  } = {},
): Promise<{
  completed: boolean;
  timedOut?: boolean;
  responseText?: string;
}> {
  const {
    timeout = 180000, // 3 minutes
  } = options;

  const startTime = Date.now();
  let lastText = '';
  let stableCount = 0;
  const STABLE_THRESHOLD = 2; // Need 2 consecutive stable checks (2 seconds)

  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      const finalStatus = await page.evaluate(() => {
        const modelResponses = Array.from(document.querySelectorAll('model-response'));
        if (modelResponses.length > 0) {
          const lastResponse = modelResponses[modelResponses.length - 1];
          return { responseText: lastResponse.textContent?.trim() || '' };
        }
        const main = document.querySelector('main');
        return { responseText: main?.innerText.slice(-5000) || '' };
      });

      return {
        completed: false,
        timedOut: true,
        responseText: finalStatus.responseText,
      };
    }

    // Poll status
    const status = await page.evaluate(() => {
      // Check for stop icon (Gemini's thinking/generating indicator)
      const stopIcon = document.querySelector('.stop-icon mat-icon[fonticon="stop"]') ||
                      document.querySelector('mat-icon[data-mat-icon-name="stop"]') ||
                      document.querySelector('.blue-circle.stop-icon') ||
                      document.querySelector('div.stop-icon');
      const hasStopIcon = !!stopIcon;

      // Check for stop button
      const buttons = Array.from(document.querySelectorAll('button'));
      const stopButton = buttons.find(b => {
        const text = b.textContent || '';
        const ariaLabel = b.getAttribute('aria-label') || '';
        return text.includes('回答を停止') || text.includes('Stop') ||
               ariaLabel.includes('Stop') || ariaLabel.includes('停止');
      });

      // Check for send button enabled (indicates completion)
      const sendButton = buttons.find(b => {
        const hasLabel = b.textContent?.includes('プロンプトを送信') ||
            b.getAttribute('aria-label')?.includes('プロンプトを送信') ||
            b.getAttribute('aria-label')?.includes('Send message');
        return hasLabel && !b.disabled;
      });

      // Check for thinking indicators
      const bodyText = document.body.innerText;
      const isTyping = bodyText.includes('Gemini が入力中です') ||
                      bodyText.includes('Gemini is typing');
      const isThinking = bodyText.includes('Analyzing') ||
                        bodyText.includes('分析中') ||
                        bodyText.includes('Crafting') ||
                        bodyText.includes('作成中') ||
                        bodyText.includes('Thinking') ||
                        bodyText.includes('思考中');

      // Check for loading indicators
      const hasSpinner = document.querySelector('[role="progressbar"]') !== null ||
                        document.querySelector('[aria-busy="true"]') !== null;

      const isGenerating = hasStopIcon || !!stopButton || isTyping || isThinking || hasSpinner;

      // Get response text
      const modelResponses = Array.from(document.querySelectorAll('model-response'));
      let responseText = '';
      if (modelResponses.length > 0) {
        const lastResponse = modelResponses[modelResponses.length - 1];
        responseText = lastResponse.textContent?.trim() || '';
      }
      if (!responseText) {
        const main = document.querySelector('main');
        responseText = main?.innerText.slice(-5000) || '';
      }

      return { isGenerating, responseText, hasSendButton: !!sendButton };
    });

    // Check if generation stopped and text is stable
    if (!status.isGenerating && status.responseText.length > 0) {
      if (status.responseText === lastText) {
        stableCount++;
        if (stableCount >= STABLE_THRESHOLD) {
          return {
            completed: true,
            responseText: status.responseText,
          };
        }
      } else {
        stableCount = 1; // Reset but count this as first stable
        lastText = status.responseText;
      }
    } else {
      stableCount = 0;
      lastText = status.responseText;
    }

    // Wait 1 second before next poll
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

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

interface ChatSessions {
    [projectName: string]: ChatSession[];
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

    if (!sessions[projectName]) {
        sessions[projectName] = [];
    }

    const existingIndex = sessions[projectName].findIndex(
        s => s.chatId === session.chatId
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
    await fs.promises.mkdir(dir, { recursive: true });

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
        const conversationNum = String(metadata.conversationNumber || 1).padStart(3, '0');
        const filename = `${conversationNum}-${timestamp}-${topicSlug}.md`;
        const logDir = path.join('docs/ask/gemini', metadata.chatId);
        logPath = path.join(process.cwd(), logDir, filename);
        await fs.promises.mkdir(path.join(process.cwd(), logDir), { recursive: true });
    } else {
        const filename = `${timestamp}-${projectName}-${topicSlug}.md`;
        const logDir = 'docs/ask/gemini';
        logPath = path.join(process.cwd(), logDir, filename);
        await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
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
    description: `Ask Gemini a question via web browser automation. Conversations are organized by project name and logged to docs/ask/gemini/.`,
    annotations: {
        category: ToolCategories.NAVIGATION_AUTOMATION,
        readOnlyHint: false,
    },
    schema: {
        question: z
            .string()
            .describe(
                'The question to ask Gemini.',
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
                'Force creation of a new chat. Default: false',
            ),
    },
    handler: async (request, response, context) => {
        const { question, projectName, createNewChat = false } = request.params;
        const sanitizedQuestion = sanitizeQuestion(question);
        const project = projectName || path.basename(process.cwd()) || 'unknown-project';
        const page = context.getSelectedPage();

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
                        (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
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
            await navigateWithRetry(page, targetUrl, { waitUntil: 'networkidle2' });

            // Check login only once after navigation
            const needsLogin = await isLoginRequired(page);
            if (needsLogin) {
                response.appendResponseLine('❌ ログインが必要です');
                return;
            }

            response.appendResponseLine('質問を送信中...');

            // Input text using the textbox element
            // Gemini uses a textbox with role="textbox" or a div with contenteditable
            // NOTE: Gemini has Trusted Types CSP, so we cannot use innerHTML directly
            const questionSent = await page.evaluate((questionText) => {
                // Helper to clear element content without innerHTML (CSP-safe)
                const clearElement = (el: HTMLElement) => {
                    while (el.firstChild) {
                        el.removeChild(el.firstChild);
                    }
                };

                // Try textbox first (Gemini's current implementation)
                const textbox = document.querySelector('[role="textbox"]') as HTMLElement;
                if (textbox) {
                    textbox.focus();
                    // Clear existing content (CSP-safe)
                    clearElement(textbox);
                    // Insert text using textContent (CSP-safe)
                    textbox.textContent = questionText;
                    textbox.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }

                // Fallback to contenteditable
                const editor = document.querySelector('div[contenteditable="true"]') as HTMLElement;
                if (editor) {
                    clearElement(editor);
                    editor.textContent = questionText;
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }

                return false;
            }, sanitizedQuestion);

            if (!questionSent) {
                response.appendResponseLine('❌ 入力欄が見つかりません');
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 500));

            // Click send button - look for "プロンプトを送信" or similar
            const sent = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                // Primary: look for "プロンプトを送信" button
                let sendButton = buttons.find(b =>
                    b.textContent?.includes('プロンプトを送信') ||
                    b.textContent?.includes('送信') ||
                    b.getAttribute('aria-label')?.includes('送信') ||
                    b.getAttribute('aria-label')?.includes('Send')
                );

                // Fallback: look for send icon
                if (!sendButton) {
                    sendButton = buttons.find(b =>
                        b.querySelector('mat-icon[data-mat-icon-name="send"]') ||
                        b.querySelector('[data-icon="send"]')
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
                response.appendResponseLine('⚠️ 送信ボタンが見つかりません (Enterキーを試行)');
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
                await new Promise((resolve) => setTimeout(resolve, 500));

                const hasStarted = await page.evaluate(() => {
                    // Check for stop icon (Gemini's generating indicator)
                    const stopIcon = document.querySelector('.stop-icon mat-icon[fonticon="stop"]') ||
                                    document.querySelector('mat-icon[data-mat-icon-name="stop"]') ||
                                    document.querySelector('.blue-circle.stop-icon');

                    // Check for stop button
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const stopButton = buttons.find(b => {
                        const text = b.textContent || '';
                        const ariaLabel = b.getAttribute('aria-label') || '';
                        return text.includes('回答を停止') || text.includes('Stop') ||
                               ariaLabel.includes('Stop') || ariaLabel.includes('停止');
                    });

                    // Check for typing/thinking indicators
                    const bodyText = document.body.innerText;
                    const isTyping = bodyText.includes('Gemini が入力中です') ||
                                    bodyText.includes('Gemini is typing') ||
                                    bodyText.includes('Analyzing') ||
                                    bodyText.includes('分析中') ||
                                    bodyText.includes('Thinking') ||
                                    bodyText.includes('思考中');

                    // Check for loading spinners
                    const hasSpinner = document.querySelector('[role="progressbar"]') !== null ||
                                      document.querySelector('[aria-busy="true"]') !== null;

                    // Check for model-response appearing (even without stop button)
                    const hasNewResponse = document.querySelectorAll('model-response').length > 0;

                    return !!stopIcon || !!stopButton || isTyping || hasSpinner || hasNewResponse;
                });

                if (hasStarted) {
                    generationStarted = true;
                    break;
                }
            }

            if (!generationStarted) {
                response.appendResponseLine('⚠️ 生成開始を検出できませんでした（続行します）');
            }

            // Use hybrid polling + stability check for completion detection
            response.appendResponseLine('回答を待機中...');

            const startTime = Date.now();
            const completionResult = await waitForGeminiComplete(page, {
                timeout: 180000,
            });

            if (completionResult.timedOut) {
                response.appendResponseLine('⚠️ タイムアウト（3分）');
            }

            const responseText = completionResult.responseText || '';

            response.appendResponseLine(`✅ 回答完了 (所要時間: ${Math.floor((Date.now() - startTime) / 1000)}秒)`);

            // Save session
            if (isNewChat) {
                const chatUrl = page.url();
                const chatIdMatch = chatUrl.match(/\/app\/([a-f0-9]+)/);
                const chatId = chatIdMatch ? chatIdMatch[1] : 'unknown-' + Date.now();

                await saveChatSession(project, {
                    chatId,
                    url: chatUrl,
                    lastUsed: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    title: `[Project: ${project}]`,
                    conversationCount: 1,
                });
                sessionChatId = chatId;
            }

            // Save log
            const logPath = await saveConversationLog(
                project,
                sanitizedQuestion,
                responseText,
                {
                    chatUrl: page.url(),
                    chatId: sessionChatId,
                }
            );

            response.appendResponseLine(`📝 会話ログ保存: ${logPath}`);
            response.appendResponseLine(`🔗 チャットURL: ${page.url()}`);
            response.appendResponseLine('\n' + '='.repeat(60));
            response.appendResponseLine('Geminiの回答:\n');
            response.appendResponseLine(responseText);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            response.appendResponseLine(`❌ エラー: ${errorMessage}`);
        }
    },
});
