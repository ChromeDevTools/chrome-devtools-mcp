/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {askChatGPTFastWithTimings, ChatDebugInfo} from '../fast-cdp/fast-chat.js';
import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * デバッグ情報をマークダウン形式にフォーマット
 */
function formatDebugInfo(debug: ChatDebugInfo): string {
  const lines: string[] = [];
  lines.push('\n## Debug Info');
  lines.push(`URL: ${debug.url}`);
  lines.push(`Title: ${debug.documentTitle}`);
  lines.push('');
  lines.push('### DOM Structure');
  lines.push(`Articles: ${debug.dom.articleCount}`);
  lines.push('');
  lines.push(`#### Markdowns (${debug.dom.markdowns.length})`);
  debug.dom.markdowns.forEach((md, i) => {
    lines.push(`[${i}] class="${md.className}" thinking=${md.isResultThinking}`);
    lines.push(`    innerText (${md.innerTextLength} chars): "${md.innerText.slice(0, 200)}${md.innerText.length > 200 ? '...' : ''}"`);
  });
  lines.push('');
  lines.push('#### Last Article');
  lines.push('innerHTML:');
  lines.push(debug.dom.lastArticleHtml.slice(0, 2000) + (debug.dom.lastArticleHtml.length > 2000 ? '...' : ''));
  lines.push('');
  lines.push('innerText:');
  lines.push(debug.dom.lastArticleInnerText.slice(0, 1000) + (debug.dom.lastArticleInnerText.length > 1000 ? '...' : ''));
  lines.push('');
  lines.push('### Extraction');
  lines.push('Selectors tried:');
  debug.extraction.selectorsTried.forEach(s => {
    const status = s.found ? '✓' : '✗';
    lines.push(`  ${status} ${s.selector} → ${s.textLength} chars${s.found && debug.extraction.finalSelector === s.selector ? ' (used)' : ''}`);
  });
  if (debug.extraction.fallbackUsed) {
    lines.push(`Fallback used: ${debug.extraction.fallbackUsed}`);
  }
  lines.push('');
  lines.push('### Timings');
  const t = debug.timings;
  lines.push(`connect: ${t.connectMs}ms | input: ${t.waitInputMs}ms | send: ${t.sendMs}ms | response: ${t.waitResponseMs}ms | total: ${t.totalMs}ms`);

  return lines.join('\n');
}

export const askChatGPTWeb = defineTool({
  name: 'ask_chatgpt_web',
  description:
    'Ask ChatGPT only via browser. Note: For general queries, prefer ask_chatgpt_gemini_web to get multiple perspectives.',
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
    debug: z
      .boolean()
      .optional()
      .describe('Return detailed debug info (DOM structure, extraction attempts, timings)'),
    projectName: z.string().optional().describe('Unused (kept for compatibility)'),
    createNewChat: z
      .boolean()
      .optional()
      .describe('Unused (kept for compatibility)'),
  },
  handler: async (request, response) => {
    const {question, debug} = request.params;
    try {
      const result = await askChatGPTFastWithTimings(question, debug);
      response.appendResponseLine(result.answer || '（空の応答）');
      if (debug && result.debug) {
        response.appendResponseLine(formatDebugInfo(result.debug));
      }
    } catch (error) {
      response.appendResponseLine(
        `❌ ChatGPT接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
