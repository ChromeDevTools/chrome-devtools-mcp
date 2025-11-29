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
            response.appendResponseLine('Geminiに接続中...');
            await navigateWithRetry(page, GEMINI_CONFIG.DEFAULT_URL, { waitUntil: 'networkidle2' });

            const needsLogin = await isLoginRequired(page);
            if (needsLogin) {
                response.appendResponseLine('\n❌ Geminiへのログインが必要です');
                response.appendResponseLine('ブラウザでログインしてください。');
                return;
            }

            response.appendResponseLine('✅ ログイン確認完了');

            let isNewChat = false;
            let sessionChatId: string | undefined;

            if (!createNewChat) {
                const sessions = await loadChatSessions();
                const projectSessions = sessions[project] || [];

                if (projectSessions.length > 0) {
                    const sortedSessions = [...projectSessions].sort(
                        (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
                    );
                    const latestSession = sortedSessions[0];

                    response.appendResponseLine(`既存のチャットを使用: ${latestSession.url}`);
                    await navigateWithRetry(page, latestSession.url, { waitUntil: 'networkidle2' });
                    sessionChatId = latestSession.chatId;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                } else {
                    isNewChat = true;
                }
            } else {
                isNewChat = true;
            }

            if (isNewChat) {
                response.appendResponseLine('新規チャットを作成中...');
                await navigateWithRetry(page, GEMINI_CONFIG.BASE_URL + 'app', { waitUntil: 'networkidle2' });
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

            const startTime = Date.now();
            let stableCount = 0;
            let lastResponseText = '';

            while (true) {
                await new Promise((resolve) => setTimeout(resolve, 1500));

                const status = await page.evaluate(() => {
                    // Check for stop icon (Gemini's thinking/generating indicator)
                    // The stop icon is in a div.stop-icon with mat-icon[fonticon="stop"]
                    const stopIcon = document.querySelector('.stop-icon mat-icon[fonticon="stop"]') ||
                                    document.querySelector('mat-icon[data-mat-icon-name="stop"]') ||
                                    document.querySelector('.blue-circle.stop-icon');
                    const hasStopIcon = !!stopIcon;

                    // Also check for stop button (fallback)
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const stopButton = buttons.find(b => {
                        const text = b.textContent || '';
                        const ariaLabel = b.getAttribute('aria-label') || '';
                        return text.includes('回答を停止') || text.includes('Stop') ||
                               ariaLabel.includes('Stop') || ariaLabel.includes('停止');
                    });

                    // Check for "プロンプトを送信" button - this indicates response is complete
                    // Must be enabled (not disabled) to indicate completion
                    const sendButton = buttons.find(b => {
                        const hasLabel = b.textContent?.includes('プロンプトを送信') ||
                            b.getAttribute('aria-label')?.includes('プロンプトを送信') ||
                            b.getAttribute('aria-label')?.includes('Send message');
                        return hasLabel && !b.disabled;
                    });

                    // Check for status text and thinking indicators
                    const bodyText = document.body.innerText;
                    const isTyping = bodyText.includes('Gemini が入力中です') ||
                                    bodyText.includes('Gemini is typing');

                    // Check for thinking/analyzing indicators (Gemini shows these during processing)
                    const isThinking = bodyText.includes('Analyzing') ||
                                      bodyText.includes('分析中') ||
                                      bodyText.includes('Crafting') ||
                                      bodyText.includes('作成中') ||
                                      bodyText.includes('Thinking') ||
                                      bodyText.includes('思考中') ||
                                      bodyText.includes('Researching') ||
                                      bodyText.includes('調査中');

                    // Check for loading spinners or progress indicators
                    const hasSpinner = document.querySelector('[role="progressbar"]') !== null ||
                                      document.querySelector('.loading') !== null ||
                                      document.querySelector('[aria-busy="true"]') !== null;

                    const isComplete = (bodyText.includes('Gemini が回答しました') ||
                                      bodyText.includes('Gemini has responded') ||
                                      !!sendButton) && !isThinking && !hasSpinner && !hasStopIcon;

                    const isGenerating = hasStopIcon || !!stopButton || isTyping || isThinking || hasSpinner;

                    // Get the response content from model-response elements
                    const modelResponses = Array.from(document.querySelectorAll('model-response'));
                    let responseContent = '';
                    if (modelResponses.length > 0) {
                        // Get the last model response
                        const lastResponse = modelResponses[modelResponses.length - 1];
                        responseContent = lastResponse.textContent || '';
                    }

                    // Fallback: get text from main area
                    if (!responseContent) {
                        const main = document.querySelector('main');
                        responseContent = main?.innerText || '';
                    }

                    return {
                        isGenerating,
                        isComplete,
                        responseContent
                    };
                });

                // If explicitly marked as complete, we're done
                if (status.isComplete && !status.isGenerating) {
                    break;
                }

                // If not generating and response text is stable for 2 iterations, we're done
                if (!status.isGenerating && status.responseContent === lastResponseText && status.responseContent.length > 0) {
                    stableCount++;
                    if (stableCount >= 2) {
                        break;
                    }
                } else {
                    stableCount = 0;
                }

                lastResponseText = status.responseContent;

                if (Date.now() - startTime > 180000) { // 3 mins timeout
                    response.appendResponseLine('⚠️ タイムアウト（3分）');
                    break;
                }
            }

            // Get the final response content
            const responseText = await page.evaluate(() => {
                // Get content from model-response elements
                const modelResponses = Array.from(document.querySelectorAll('model-response'));
                if (modelResponses.length > 0) {
                    // Get the last model response
                    const lastResponse = modelResponses[modelResponses.length - 1];
                    return lastResponse.textContent?.trim() || '';
                }

                // Fallback: get text from main area
                const main = document.querySelector('main');
                return main?.innerText.slice(-5000) || '';
            });

            response.appendResponseLine('✅ 回答完了');

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

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            response.appendResponseLine(`❌ エラー: ${errorMessage}`);

            // Error snapshot
            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const debugDir = path.join(process.cwd(), 'docs/ask/gemini/debug');
                await fs.promises.mkdir(debugDir, { recursive: true });

                const screenshotPath = path.join(debugDir, `error-${timestamp}.png`) as `${string}.png`;
                await page.screenshot({ path: screenshotPath });
                response.appendResponseLine(`📸 エラー時のスクリーンショット: ${screenshotPath}`);

                const htmlPath = path.join(debugDir, `error-${timestamp}.html`);
                const html = await page.content();
                await fs.promises.writeFile(htmlPath, html, 'utf-8');
                response.appendResponseLine(`📄 エラー時のHTML: ${htmlPath}`);
            } catch (snapshotError) {
                console.error('Failed to capture error snapshot:', snapshotError);
            }
        }
    },
});
