/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {askGeminiFast} from '../fast-cdp/fast-chat.js';
import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const askGeminiWeb = defineTool({
  name: 'ask_gemini_web',
  description:
    'Ask Gemini via browser (fast CDP path). Focused on chat send/receive only.',
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
    projectName: z.string().optional().describe('Unused (kept for compatibility)'),
    createNewChat: z
      .boolean()
      .optional()
      .describe('Unused (kept for compatibility)'),
  },
  handler: async (request, response) => {
    const {question} = request.params;
    try {
      const answer = await askGeminiFast(question);
      response.appendResponseLine(answer || '（空の応答）');
    } catch (error) {
      response.appendResponseLine(
        `❌ Gemini接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
