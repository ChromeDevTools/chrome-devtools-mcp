#!/usr/bin/env node
/**
 * fast-chat.ts 直接テストスクリプト
 *
 * MCPサーバーを介さずにfast-chat機能を直接テストする。
 * デバッグ時のフィードバックループを高速化するためのツール。
 *
 * 使い方:
 *   # ビルド後に実行（browser-globals-mockは--importで自動適用）
 *   node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs chatgpt
 *   node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs gemini
 *   node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs both "質問文"
 *
 * npm scriptとして:
 *   npm run test:chatgpt
 *   npm run test:gemini
 *   npm run test:both
 */

import {askChatGPTFast, askGeminiFast, getClient} from '../build/src/fast-cdp/fast-chat.js';

const target = process.argv[2] || 'chatgpt';
const question = process.argv[3];

// 質問が指定されていない場合はエラー
if (!question) {
  console.error('');
  console.error('エラー: 質問を引数で指定してください');
  console.error('');
  console.error('使い方:');
  console.error('  npm run test:chatgpt -- "質問文"');
  console.error('  npm run test:gemini -- "質問文"');
  console.error('  npm run test:both -- "質問文"');
  console.error('');
  console.error('例:');
  console.error('  npm run test:chatgpt -- "Pythonでデコレータを使う場面は？"');
  console.error('  npm run test:gemini -- "Goのインターフェースの使い方を教えて"');
  console.error('  npm run test:both -- "TypeScriptのconditional typesの実用例を1つ見せて"');
  console.error('');
  console.error('注意: BAN回避のため、毎回異なる自然な技術的質問を使用してください');
  console.error('');
  process.exit(1);
}

async function testChatGPT(q) {
  console.error('\n========================================');
  console.error('=== ChatGPT テスト開始 ===');
  console.error('========================================');
  console.error(`質問: "${q}"`);
  console.error('');

  const startTime = Date.now();
  try {
    // 接続確立フェーズ
    console.error('[Phase 1] クライアント接続中...');
    const client = await getClient('chatgpt');
    console.error(`[Phase 1] 接続完了 (${Date.now() - startTime}ms)`);

    // 質問送信フェーズ
    console.error('[Phase 2] 質問送信中...');
    const answer = await askChatGPTFast(q);
    const elapsed = Date.now() - startTime;

    console.error('');
    console.error('========================================');
    console.error('=== ChatGPT 結果 ===');
    console.error('========================================');
    console.error(`回答: ${answer}`);
    console.error(`所要時間: ${elapsed}ms`);
    console.error('========================================');

    return {success: true, answer, elapsed};
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error('');
    console.error('========================================');
    console.error('=== ChatGPT エラー ===');
    console.error('========================================');
    console.error(`エラー: ${err.message}`);
    console.error(`スタックトレース:\n${err.stack}`);
    console.error(`所要時間: ${elapsed}ms`);
    console.error('========================================');

    return {success: false, error: err.message, elapsed};
  }
}

async function testGemini(q) {
  console.error('\n========================================');
  console.error('=== Gemini テスト開始 ===');
  console.error('========================================');
  console.error(`質問: "${q}"`);
  console.error('');

  const startTime = Date.now();
  try {
    // 接続確立フェーズ
    console.error('[Phase 1] クライアント接続中...');
    const client = await getClient('gemini');
    console.error(`[Phase 1] 接続完了 (${Date.now() - startTime}ms)`);

    // 質問送信フェーズ
    console.error('[Phase 2] 質問送信中...');
    const answer = await askGeminiFast(q);
    const elapsed = Date.now() - startTime;

    console.error('');
    console.error('========================================');
    console.error('=== Gemini 結果 ===');
    console.error('========================================');
    console.error(`回答: ${answer}`);
    console.error(`所要時間: ${elapsed}ms`);
    console.error('========================================');

    return {success: true, answer, elapsed};
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error('');
    console.error('========================================');
    console.error('=== Gemini エラー ===');
    console.error('========================================');
    console.error(`エラー: ${err.message}`);
    console.error(`スタックトレース:\n${err.stack}`);
    console.error(`所要時間: ${elapsed}ms`);
    console.error('========================================');

    return {success: false, error: err.message, elapsed};
  }
}

async function main() {
  console.error('');
  console.error('╔════════════════════════════════════════╗');
  console.error('║  fast-chat.ts 直接テストスクリプト    ║');
  console.error('╚════════════════════════════════════════╝');
  console.error('');
  console.error(`ターゲット: ${target}`);
  console.error(`質問: "${question}"`);
  console.error('');

  const results = {};

  if (target === 'chatgpt' || target === 'both') {
    results.chatgpt = await testChatGPT(question);
  }

  if (target === 'gemini' || target === 'both') {
    results.gemini = await testGemini(question);
  }

  // サマリー出力
  console.error('\n');
  console.error('╔════════════════════════════════════════╗');
  console.error('║            テスト結果サマリー          ║');
  console.error('╚════════════════════════════════════════╝');

  if (results.chatgpt) {
    const r = results.chatgpt;
    console.error(`ChatGPT: ${r.success ? '✅ 成功' : '❌ 失敗'} (${r.elapsed}ms)`);
    if (r.success) {
      console.error(`  回答: ${r.answer.slice(0, 80)}${r.answer.length > 80 ? '...' : ''}`);
    } else {
      console.error(`  エラー: ${r.error}`);
    }
  }

  if (results.gemini) {
    const r = results.gemini;
    console.error(`Gemini:  ${r.success ? '✅ 成功' : '❌ 失敗'} (${r.elapsed}ms)`);
    if (r.success) {
      console.error(`  回答: ${r.answer.slice(0, 80)}${r.answer.length > 80 ? '...' : ''}`);
    } else {
      console.error(`  エラー: ${r.error}`);
    }
  }

  console.error('');

  // 終了コード
  const allSuccess = Object.values(results).every(r => r.success);
  process.exit(allSuccess ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
