/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {askAI, connectAI, AIResult} from './ai-helpers.js';

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

    // 1. 並列接続（合計3-5秒、以前は6-10秒）
    console.error('[ask_chatgpt_gemini_web] Establishing connections in parallel...');
    const connectionStart = Date.now();

    const [chatgptConn, geminiConn] = await Promise.allSettled([
      connectAI('chatgpt'),
      connectAI('gemini'),
    ]);

    const connectionTime = Date.now() - connectionStart;
    console.error(`[ask_chatgpt_gemini_web] Connections completed in ${connectionTime}ms`);

    const chatgptOk = chatgptConn.status === 'fulfilled' && chatgptConn.value.success;
    const geminiOk = geminiConn.status === 'fulfilled' && geminiConn.value.success;

    console.error(`[ask_chatgpt_gemini_web] Connection status: ChatGPT=${chatgptOk}, Gemini=${geminiOk}`);

    // 2. 接続成功した方のみクエリを実行
    const queries: Promise<AIResult>[] = [];
    const failedProviders: string[] = [];

    if (chatgptOk) {
      queries.push(askAI('chatgpt', question));
    } else {
      const error = chatgptConn.status === 'rejected'
        ? (chatgptConn.reason instanceof Error ? chatgptConn.reason.message : String(chatgptConn.reason))
        : chatgptConn.value?.error || 'Unknown error';
      failedProviders.push(`ChatGPT: ❌ 接続失敗 - ${error}`);
      console.error(`[ask_chatgpt_gemini_web] ChatGPT connection failed: ${error}`);
    }

    if (geminiOk) {
      queries.push(askAI('gemini', question));
    } else {
      const error = geminiConn.status === 'rejected'
        ? (geminiConn.reason instanceof Error ? geminiConn.reason.message : String(geminiConn.reason))
        : geminiConn.value?.error || 'Unknown error';
      failedProviders.push(`Gemini: ❌ 接続失敗 - ${error}`);
      console.error(`[ask_chatgpt_gemini_web] Gemini connection failed: ${error}`);
    }

    // 3. 少なくとも1つ接続できていれば実行
    if (queries.length > 0) {
      console.error(`[ask_chatgpt_gemini_web] Sending questions to ${queries.length} provider(s)...`);
      const queryStart = Date.now();

      const results = await Promise.all(queries);

      const queryTime = Date.now() - queryStart;
      console.error(`[ask_chatgpt_gemini_web] Queries completed in ${queryTime}ms`);

      for (const r of results) {
        if (r.success) {
          response.appendResponseLine(`${r.provider}: ${r.answer}`);
        } else {
          response.appendResponseLine(`${r.provider}: ❌ ${r.error}`);
        }
      }
    }

    // 接続失敗したプロバイダの情報も出力
    for (const failed of failedProviders) {
      response.appendResponseLine(failed);
    }

    // 両方とも失敗した場合
    if (queries.length === 0) {
      console.error('[ask_chatgpt_gemini_web] Both connections failed');
    }
  },
});
