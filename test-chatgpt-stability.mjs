#!/usr/bin/env node
/**
 * ChatGPT送信ボタン安定性テスト
 * Geminiと同様の改善を検証
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    '/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs'
  ],
  env: { ...process.env }
});

const client = new Client({name: 'chatgpt-stability-test', version: '0.0.0'});

console.log('[Test] Connecting to MCP server...');
await client.connect(transport);
console.log('[Test] Connected!\n');

const testQuestions = [
  '量子コンピュータの基本原理を簡潔に説明してください。',
  'ブロックチェーン技術の主な利点と課題を教えてください。',
  '人工知能における深層学習とは何ですか？'
];

for (let i = 0; i < testQuestions.length; i++) {
  console.log(`=== Test ${i + 1}/${testQuestions.length} ===`);
  console.log(`[Test] Question: ${testQuestions[i]}`);

  try {
    const startTime = Date.now();
    const result = await client.callTool({
      name: 'ask_chatgpt_web',
      arguments: {
        question: testQuestions[i],
      },
    });

    const elapsed = Date.now() - startTime;
    const text = result?.content?.[0]?.text || '';

    console.log(`[Test] ✅ Success in ${elapsed}ms (${text.length} chars)`);
    console.log(`[Test] Response preview: ${text.slice(0, 150)}...\n`);
  } catch (error) {
    console.error(`[Test] ❌ Failed: ${error.message}\n`);
    process.exit(1);
  }

  if (i < testQuestions.length - 1) {
    console.log('[Test] Waiting 2s before next test...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

console.log('[Test] ✅ All 3 tests passed! ChatGPT send button stability confirmed.');
await client.close();
process.exit(0);
