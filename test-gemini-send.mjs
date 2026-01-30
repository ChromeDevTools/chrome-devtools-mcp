#!/usr/bin/env node
/**
 * Gemini送信ボタン問題のテストスクリプト
 * 1回目、2回目、3回目の連続実行で動作確認
 */

import('./build/src/fast-cdp/fast-chat.js')
  .then(async (m) => {
    const testQuestions = [
      '日本の首都は？',
      '日本の人口は？',
      'Geminiの開発元は？'
    ];

    for (let i = 0; i < testQuestions.length; i++) {
      console.log(`\n=== Test ${i + 1}/${testQuestions.length} ===`);
      console.log(`Question: ${testQuestions[i]}`);

      try {
        const response = await m.askGeminiFast(testQuestions[i]);
        console.log(`✅ Success (${response.length} chars)`);
        console.log(`Response preview: ${response.slice(0, 100)}...`);
      } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        process.exit(1);
      }

      if (i < testQuestions.length - 1) {
        console.log('Waiting 2s before next test...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n✅ All tests passed!');
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
