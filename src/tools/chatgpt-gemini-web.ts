/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {askAI, connectAI, AIResult} from './ai-helpers.js';
import {ChatDebugInfo} from '../fast-cdp/fast-chat.js';

/**
 * デバッグ情報をマークダウン形式にフォーマット
 */
function formatDebugInfo(provider: string, debug: ChatDebugInfo): string {
  const lines: string[] = [];
  lines.push(`\n## ${provider} Debug Info`);
  lines.push(`URL: ${debug.url}`);
  lines.push(`Title: ${debug.documentTitle}`);
  lines.push('');
  lines.push('### DOM Structure');
  lines.push(`Articles/Responses: ${debug.dom.articleCount}`);
  lines.push('');
  lines.push(`#### Markdowns (${debug.dom.markdowns.length})`);
  debug.dom.markdowns.forEach((md, i) => {
    lines.push(`[${i}] class="${md.className}"${md.isResultThinking ? ' thinking=true' : ''}`);
    lines.push(`    innerText (${md.innerTextLength} chars): "${md.innerText.slice(0, 200)}${md.innerText.length > 200 ? '...' : ''}"`);
  });
  lines.push('');
  lines.push('#### Last Article/Response');
  lines.push('innerHTML:');
  lines.push(debug.dom.lastArticleHtml.slice(0, 1500) + (debug.dom.lastArticleHtml.length > 1500 ? '...' : ''));
  lines.push('');
  lines.push('innerText:');
  lines.push(debug.dom.lastArticleInnerText.slice(0, 800) + (debug.dom.lastArticleInnerText.length > 800 ? '...' : ''));
  lines.push('');
  lines.push('### Extraction');
  lines.push('Selectors tried:');
  debug.extraction.selectorsTried.forEach(s => {
    const status = s.found ? '✓' : '✗';
    lines.push(`  ${status} ${s.selector} → ${s.textLength} chars`);
  });
  if (debug.extraction.finalSelector) {
    lines.push(`Final selector: ${debug.extraction.finalSelector}`);
  }
  if (debug.extraction.fallbackUsed) {
    lines.push(`Fallback used: ${debug.extraction.fallbackUsed}`);
  }
  lines.push('');
  lines.push('### Timings');
  const t = debug.timings;
  const nav = t.navigateMs ? ` | navigate: ${t.navigateMs}ms` : '';
  lines.push(`connect: ${t.connectMs}ms${nav} | input: ${t.waitInputMs}ms | send: ${t.sendMs}ms | response: ${t.waitResponseMs}ms | total: ${t.totalMs}ms`);

  return lines.join('\n');
}

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
    debug: z
      .boolean()
      .optional()
      .describe('Return detailed debug info (DOM structure, extraction attempts, timings)'),
  },
  handler: async (request, response) => {
    const {question, debug} = request.params;

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
      queries.push(askAI('chatgpt', question, debug));
    } else {
      const error = chatgptConn.status === 'rejected'
        ? (chatgptConn.reason instanceof Error ? chatgptConn.reason.message : String(chatgptConn.reason))
        : chatgptConn.value?.error || 'Unknown error';
      failedProviders.push(`ChatGPT: ❌ 接続失敗 - ${error}`);
      console.error(`[ask_chatgpt_gemini_web] ChatGPT connection failed: ${error}`);
    }

    if (geminiOk) {
      queries.push(askAI('gemini', question, debug));
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
          if (debug && r.debug) {
            response.appendResponseLine(formatDebugInfo(r.provider, r.debug));
          }
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
