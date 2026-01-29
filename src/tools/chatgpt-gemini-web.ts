/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {askChatGPTFast, askGeminiFast, getClient} from '../fast-cdp/fast-chat.js';
import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const askChatGptGeminiWeb = defineTool({
  name: 'ask_chatgpt_gemini_web',
  description:
    '[RECOMMENDED] Ask ChatGPT and Gemini in parallel via browser (fast CDP path). Use this by default unless user explicitly specifies single AI.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    question: z
      .string()
      .describe(
        'Question to ask. Do not include secrets/PII. No mention of MCP/AI.',
      ),
  },
  handler: async (request, response) => {
    const {question} = request.params;

    // 接続確立はシーケンシャル（安定性重視）
    // 並列で接続すると拡張機能側で競合が発生する可能性があるため
    console.error('[ask_chatgpt_gemini_web] Establishing connections sequentially...');

    try {
      await getClient('chatgpt');
      console.error('[ask_chatgpt_gemini_web] ChatGPT connection ready');
    } catch (error) {
      console.error('[ask_chatgpt_gemini_web] ChatGPT pre-connection failed:', error);
    }

    try {
      await getClient('gemini');
      console.error('[ask_chatgpt_gemini_web] Gemini connection ready');
    } catch (error) {
      console.error('[ask_chatgpt_gemini_web] Gemini pre-connection failed:', error);
    }

    console.error('[ask_chatgpt_gemini_web] Sending questions in parallel...');

    // クエリ送信は並列（速度重視）
    // 接続は既にキャッシュされているので、ここでは純粋にクエリ送信のみ
    const [chatgpt, gemini] = await Promise.all([
      askChatGPTFast(question).catch(error =>
        `❌ ChatGPT接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      ),
      askGeminiFast(question).catch(error =>
        `❌ Gemini接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ]);
    response.appendResponseLine(`ChatGPT: ${chatgpt || '（空の応答）'}`);
    response.appendResponseLine(`Gemini: ${gemini || '（空の応答）'}`);
  },
});
