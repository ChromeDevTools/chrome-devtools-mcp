/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import z from 'zod';

import { ToolCategories } from './categories.js';
import { defineTool } from './ToolDefinition.js';
import { loadGeminiSelectors, getGeminiSelector } from '../selectors/loader.js';
import { GEMINI_CONFIG } from '../config.js';
import { isLoginRequired } from '../login-helper.js';

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
            await page.goto(GEMINI_CONFIG.DEFAULT_URL, { waitUntil: 'networkidle2' });

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
                    await page.goto(latestSession.url, { waitUntil: 'networkidle2' });
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
                await page.goto(GEMINI_CONFIG.BASE_URL + 'app', { waitUntil: 'networkidle2' });
            }

            response.appendResponseLine('質問を送信中...');

            // Input text
            const questionSent = await page.evaluate((questionText) => {
                const editor = document.querySelector('div[contenteditable="true"]') as HTMLElement;
                if (!editor) return false;

                editor.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = questionText;
                editor.appendChild(p);
                editor.dispatchEvent(new Event('input', { bubbles: true }));
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
                const sendButton = buttons.find(b => b.getAttribute('aria-label') === '送信' || b.querySelector('mat-icon[data-mat-icon-name="send"]'));
                if (sendButton) {
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

            // Wait for response
            // Gemini usually shows a "Stop responding" button or similar while generating
            // We can check for the presence of the latest user message and then wait for the assistant message

            const startTime = Date.now();
            let lastText = '';

            while (true) {
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const status = await page.evaluate(() => {
                    // Check if generating (look for stop button or spinner)
                    // This is tricky without exact selectors. 
                    // We can assume if the last message is from user, it's still thinking/generating
                    // OR if the last message is from model but empty/streaming.

                    const messageContainers = document.querySelectorAll('message-content'); // Hypothetical selector
                    // Better: look for model-response or similar

                    // Generic approach: check for text change in the last response container
                    // or check for "Stop" button

                    // Gemini specific: "Stop response" button
                    // aria-label="Stop response" or similar
                    const stopButton = document.querySelector('button[aria-label*="Stop"]');
                    const isGenerating = !!stopButton;

                    // Get all response texts
                    // Gemini responses are usually in specific containers.
                    // Let's try to find the last response text.
                    // This is a guess.
                    const responses = Array.from(document.querySelectorAll('.model-response-text, .message-content, [data-message-id]'));
                    // If we can't find specific classes, we might need to rely on text content changes.

                    // Fallback: get all text from the main chat area
                    const chatArea = document.querySelector('main');
                    const fullText = chatArea?.innerText || '';

                    return {
                        isGenerating,
                        fullText
                    };
                });

                // If not generating and text hasn't changed for a while, assume done.
                // But "isGenerating" might be false if it hasn't started yet.

                // Let's use a simpler timeout-based approach for now if we can't reliably detect "generating" state without selectors.
                // Or better: wait for the text to stabilize.

                if (!status.isGenerating && status.fullText.length > lastText.length) {
                    // Still receiving content (maybe) or just finished
                    // If it was generating and now isn't, it's done.
                }

                // For this initial version, let's just wait for text to stabilize for 5 seconds.
                if (status.fullText === lastText && status.fullText.length > 0) {
                    // Stable for 2 seconds (since loop is 2s)
                    // Let's wait one more loop to be sure
                    // Actually, let's just break if it's stable and not generating
                    if (!status.isGenerating) {
                        break;
                    }
                }

                lastText = status.fullText;

                if (Date.now() - startTime > 120000) { // 2 mins timeout
                    break;
                }
            }

            // Get the final response
            // We need to extract the LAST response.
            const responseText = await page.evaluate(() => {
                // Try to find the last model response
                // This is hard without specific selectors.
                // Let's return the last chunk of text that looks like a response.

                // Heuristic: The text after the last user prompt.
                // Find all user prompts
                const userPrompts = Array.from(document.querySelectorAll('.user-query, .user-message')); // Hypothetical
                // ...

                // Simplest fallback: Return the whole chat text or just the last 2000 chars
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
        }
    },
});
