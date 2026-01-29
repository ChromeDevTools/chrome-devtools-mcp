/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {askChatGPTFast, askGeminiFast} from '../fast-cdp/fast-chat.js';
import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const askChatGptGeminiWeb = defineTool({
  name: 'ask_chatgpt_gemini_web',
  description:
    'Ask ChatGPT and Gemini in parallel via browser (fast CDP path).',
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
