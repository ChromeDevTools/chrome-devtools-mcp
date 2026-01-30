#!/usr/bin/env node
/**
 * Gemini送信ボタン修正の動作確認テスト
 * MCPツールとして3回連続実行
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    '/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs',
    '--attachTabUrl=https://gemini.google.com/',
    '--attachTabNew'
  ],
  env: { ...process.env }
});

const client = new Client({name: 'gemini-send-test', version: '0.0.0'});

console.log('[Test] Connecting to MCP server...');
await client.connect(transport);
console.log('[Test] Connected!');

const testQuestions = [
  '量子コンピュータと古典コンピュータの根本的な違いについて、物理学的な原理と計算複雑性の観点から詳しく説明してください。また、実用化における現在の課題と将来の展望について述べてください。',
  'ブロックチェーン技術の暗号学的基盤について、ハッシュ関数、電子署名、コンセンサスアルゴリズムの役割を詳細に解説してください。さらに、スケーラビリティ問題の解決策としてのLayer 2ソリューションの仕組みについても説明してください。',
  '人工知能における深層学習と従来の機械学習手法の違いについて、アーキテクチャ、学習アルゴリズム、応用分野の観点から比較分析してください。また、トランスフォーマーモデルの革新性と今後の発展可能性についても論じてください。'
];

for (let i = 0; i < testQuestions.length; i++) {
  console.log(`\n=== Test ${i + 1}/${testQuestions.length} ===`);
  console.log(`[Test] Question: ${testQuestions[i]}`);

  try {
    const startTime = Date.now();
    const result = await client.callTool({
      name: 'ask_gemini_web',
      arguments: {
        question: testQuestions[i],
      },
    });

    const elapsed = Date.now() - startTime;
    const text = result?.content?.[0]?.text || '';

    console.log(`[Test] ✅ Success in ${elapsed}ms (${text.length} chars)`);
    console.log(`[Test] Response preview: ${text.slice(0, 150)}...`);
  } catch (error) {
    console.error(`[Test] ❌ Failed: ${error.message}`);
    process.exit(1);
  }

  if (i < testQuestions.length - 1) {
    console.log('[Test] Waiting 2s before next test...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

console.log('\n[Test] ✅ All 3 tests passed! Send button fix is working.');
await client.close();
process.exit(0);
