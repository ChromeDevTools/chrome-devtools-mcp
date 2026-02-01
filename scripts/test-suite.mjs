#!/usr/bin/env node
/**
 * 継続的テストスイート
 *
 * Usage:
 *   npm run test:suite              # 全シナリオ実行
 *   npm run test:suite -- --smoke   # smokeタグのみ
 *   npm run test:suite -- --regression  # regressionタグのみ
 *   npm run test:suite -- --id=chatgpt-thinking-mode  # 特定シナリオ
 *   npm run test:suite -- --debug   # デバッグ情報付き
 */

import {
  askChatGPTFastWithTimings,
  askGeminiFastWithTimings,
} from '../build/src/fast-cdp/fast-chat.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Geminiのスタックエラー時に自動リトライするラッパー
 */
async function askGeminiWithRetry(question, debug) {
  const maxRetries = 2;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await askGeminiFastWithTimings(question, debug);
    } catch (error) {
      lastError = error;

      // GEMINI_STUCK_* エラーの場合はリトライ
      if (error.message?.includes('GEMINI_STUCK_') && attempt < maxRetries) {
        console.error(`[test-suite] Gemini stuck error on attempt ${attempt}, retrying...`);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// シナリオ定義を読み込み
const scenariosPath = path.join(__dirname, 'test-scenarios.json');
const scenariosData = JSON.parse(await fs.readFile(scenariosPath, 'utf-8'));
const scenarios = scenariosData.scenarios;

// 引数パース
const args = process.argv.slice(2);

// ヘルプ表示
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
継続的テストスイート v${scenariosData.version}

Usage:
  npm run test:suite              # 全シナリオ実行
  npm run test:suite -- --smoke   # smokeタグのみ
  npm run test:suite -- --regression  # regressionタグのみ
  npm run test:suite -- --id=<scenario-id>  # 特定シナリオ
  npm run test:suite -- --debug   # デバッグ情報付き
  npm run test:suite -- --list    # シナリオ一覧表示

利用可能なタグ:
  --smoke       基本動作確認（新規チャット、並列クエリ）
  --regression  過去の問題再発確認
  --chatgpt     ChatGPT関連のみ
  --gemini      Gemini関連のみ
  --thinking    Thinkingモード関連
  --parallel    並列クエリ関連

シナリオ一覧:
${scenarios.map(s => `  ${s.id.padEnd(25)} ${s.name} [${s.tags.join(', ')}]`).join('\n')}
`);
  process.exit(0);
}

// シナリオ一覧表示
if (args.includes('--list')) {
  console.log('\nシナリオ一覧:');
  console.log('─'.repeat(70));
  for (const s of scenarios) {
    console.log(`  ${s.id.padEnd(25)} ${s.name}`);
    console.log(`    タグ: ${s.tags.join(', ')}`);
    console.log(`    プロバイダー: ${s.provider}`);
    console.log('');
  }
  process.exit(0);
}

const filterId = args.find(a => a.startsWith('--id='))?.slice(5);
const debug = args.includes('--debug');

// タグフィルター（--smoke, --regression など）
const reservedFlags = ['debug', 'help', 'list', 'h'];
const tagFilters = args
  .filter(a => a.startsWith('--') && !a.includes('=') && !reservedFlags.includes(a.slice(2)))
  .map(a => a.slice(2));

/**
 * 質問からキーワードを抽出する
 * @param {string} question - 質問文
 * @returns {string[]} - キーワードの配列
 */
function extractKeywords(question) {
  const keywords = [];

  // 英語の技術用語を抽出
  const englishTerms = question.match(/[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*/g) || [];
  for (const term of englishTerms) {
    if (term.length >= 2) {
      keywords.push(term.toLowerCase());
    }
  }

  // カタカナ語を抽出
  const katakanaTerms = question.match(/[ァ-ヶー]+/g) || [];
  for (const term of katakanaTerms) {
    if (term.length >= 2) {
      keywords.push(term);
    }
  }

  return [...new Set(keywords)];
}

/**
 * 関連性を計算する
 * @param {string} question - 質問文
 * @param {string} answer - 回答文
 * @returns {number} - マッチ率 (0-1)
 */
function calculateRelevance(question, answer) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return 1;

  const answerLower = answer.toLowerCase();
  const matchedKeywords = keywords.filter(kw =>
    answerLower.includes(kw.toLowerCase())
  );

  return matchedKeywords.length / keywords.length;
}

/**
 * アサーション検証
 * @param {object} assertions - アサーション定義
 * @param {object} response - レスポンス
 * @param {string} question - 質問文
 * @returns {object} - 検証結果
 */
async function validateAssertions(assertions, response, question) {
  const results = { allPassed: true, checks: [] };

  // 並列クエリの場合
  if (response.chatgpt && response.gemini) {
    // bothMustSucceed チェック
    if (assertions.bothMustSucceed) {
      const chatgptOk = response.chatgpt.answer && response.chatgpt.answer.length > 0;
      const geminiOk = response.gemini.answer && response.gemini.answer.length > 0;
      const passed = chatgptOk && geminiOk;
      results.checks.push({
        name: 'bothMustSucceed',
        passed,
        actual: { chatgpt: chatgptOk, gemini: geminiOk },
      });
      if (!passed) results.allPassed = false;
    }

    // minAnswerLength チェック（両方）
    if (assertions.minAnswerLength) {
      const chatgptLen = response.chatgpt.answer?.length || 0;
      const geminiLen = response.gemini.answer?.length || 0;
      const passed = chatgptLen >= assertions.minAnswerLength && geminiLen >= assertions.minAnswerLength;
      results.checks.push({
        name: 'minAnswerLength',
        passed,
        actual: { chatgpt: chatgptLen, gemini: geminiLen },
        expected: assertions.minAnswerLength,
      });
      if (!passed) results.allPassed = false;
    }

    return results;
  }

  // 単一プロバイダーの場合
  const answer = response.answer || '';

  // 回答長チェック
  if (assertions.minAnswerLength) {
    const len = answer.length;
    const passed = len >= assertions.minAnswerLength;
    results.checks.push({
      name: 'minAnswerLength',
      passed,
      actual: len,
      expected: assertions.minAnswerLength,
    });
    if (!passed) results.allPassed = false;
  }

  // 関連性チェック
  if (assertions.relevanceThreshold) {
    const rate = calculateRelevance(question, answer);
    const passed = rate >= assertions.relevanceThreshold;
    results.checks.push({
      name: 'relevance',
      passed,
      actual: Math.round(rate * 100) / 100,
      expected: assertions.relevanceThreshold,
    });
    if (!passed) results.allPassed = false;
  }

  // 最大時間チェック
  if (assertions.maxTotalMs && response.timings) {
    const totalMs = response.timings.totalMs || 0;
    const passed = totalMs <= assertions.maxTotalMs;
    results.checks.push({
      name: 'maxTotalMs',
      passed,
      actual: totalMs,
      expected: assertions.maxTotalMs,
    });
    if (!passed) results.allPassed = false;
  }

  // フォールバック未使用チェック
  if (assertions.noFallback && response.debug) {
    const used = !!response.debug.extraction?.fallbackUsed;
    const passed = !used;
    results.checks.push({
      name: 'noFallback',
      passed,
      actual: used,
    });
    if (!passed) results.allPassed = false;
  }

  // 空のMarkdownチェック
  if (assertions.noEmptyMarkdown) {
    // Markdownのみで回答が空の場合を検出
    const stripped = answer.replace(/[#*`\-_\[\]()>\n\s]/g, '');
    const passed = stripped.length > 10;
    results.checks.push({
      name: 'noEmptyMarkdown',
      passed,
      actual: stripped.length,
      expected: '>10',
    });
    if (!passed) results.allPassed = false;
  }

  return results;
}

/**
 * シナリオを実行する
 * @param {object} scenario - シナリオ定義
 * @returns {object} - 実行結果
 */
async function runScenario(scenario) {
  const question = scenario.question.template
    .replace('{{timestamp}}', Date.now().toString(36));

  const provider = scenario.provider;
  const result = {
    scenario: scenario.id,
    name: scenario.name,
    passed: false,
    details: {},
    question,
    startTime: new Date().toISOString(),
  };

  try {
    let response;
    if (provider === 'chatgpt') {
      response = await askChatGPTFastWithTimings(question, debug);
    } else if (provider === 'gemini') {
      response = await askGeminiWithRetry(question, debug);
    } else if (provider === 'both') {
      const [chatgpt, gemini] = await Promise.all([
        askChatGPTFastWithTimings(question, debug),
        askGeminiWithRetry(question, debug),
      ]);
      response = { chatgpt, gemini };
    }

    // アサーション検証
    result.details = await validateAssertions(scenario.assertions, response, question);
    result.passed = result.details.allPassed;
    result.response = response;
    result.endTime = new Date().toISOString();
  } catch (error) {
    result.error = error.message;
    result.stack = error.stack;
    result.passed = false;
    result.endTime = new Date().toISOString();
  }

  return result;
}

/**
 * 数値をフォーマット
 * @param {number} num - 数値
 * @returns {string} - フォーマットされた文字列
 */
function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * メイン実行
 */
async function main() {
  // テスト開始前にGeminiセッションをクリア（前回のテストの残りを防ぐ）
  const sessionsPath = path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'sessions.json');
  try {
    const sessionsData = JSON.parse(await fs.readFile(sessionsPath, 'utf-8'));
    const project = path.basename(process.cwd());
    if (sessionsData.projects?.[project]?.gemini) {
      delete sessionsData.projects[project].gemini;
      await fs.writeFile(sessionsPath, JSON.stringify(sessionsData, null, 2), 'utf-8');
      console.log('[Test Suite] Cleared Gemini session from previous test run');
    }
  } catch {
    // セッションファイルがない場合は無視
  }

  // シナリオをフィルタリング
  const filtered = scenarios.filter(s => {
    if (filterId) return s.id === filterId;
    if (tagFilters.length > 0) {
      return tagFilters.some(tag => s.tags.includes(tag));
    }
    return true;
  });

  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           継続的テストスイート v1.0.0                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`シナリオ数: ${filtered.length}`);
  if (filterId) {
    console.log(`フィルタ: --id=${filterId}`);
  } else if (tagFilters.length > 0) {
    console.log(`フィルタ: ${tagFilters.map(t => `--${t}`).join(' ')}`);
  }
  console.log(`デバッグ: ${debug ? 'ON' : 'OFF'}`);
  console.log('');
  console.log('─'.repeat(60));

  const results = [];
  for (const scenario of filtered) {
    console.log('');
    console.log(`▶ ${scenario.name} [${scenario.id}]`);
    console.log(`  タグ: ${scenario.tags.join(', ')}`);

    if (scenario.setup?.instruction) {
      console.log(`  ⚠️  セットアップ: ${scenario.setup.instruction}`);
    }

    const result = await runScenario(scenario);
    results.push(result);

    if (result.passed) {
      console.log(`  ✅ PASS`);
    } else {
      console.log(`  ❌ FAIL`);
    }

    // 失敗したチェックを表示
    if (!result.passed && result.details?.checks) {
      result.details.checks.filter(c => !c.passed).forEach(c => {
        const actual = typeof c.actual === 'object' ? JSON.stringify(c.actual) : c.actual;
        const expected = c.expected !== undefined ? `, expected ${c.expected}` : '';
        console.log(`     - ${c.name}: got ${actual}${expected}`);
      });
    }

    // エラー表示
    if (result.error) {
      console.log(`     - Error: ${result.error}`);
    }

    // Geminiシナリオ後はセッションをクリア（次のテストへの影響を防ぐ）
    if (scenario.provider === 'gemini' || scenario.provider === 'both') {
      try {
        const sessionsData = JSON.parse(await fs.readFile(sessionsPath, 'utf-8'));
        const project = path.basename(process.cwd());
        if (sessionsData.projects?.[project]?.gemini) {
          delete sessionsData.projects[project].gemini;
          await fs.writeFile(sessionsPath, JSON.stringify(sessionsData, null, 2), 'utf-8');
        }
      } catch {
        // セッションファイルがない場合は無視
      }
    }

    // 回答プレビュー（成功時）
    if (result.passed && result.response) {
      let preview = '';
      if (result.response.chatgpt && result.response.gemini) {
        preview = `ChatGPT: "${(result.response.chatgpt.answer || '').slice(0, 40)}..."`;
      } else {
        preview = `"${(result.response.answer || '').slice(0, 50)}..."`;
      }
      console.log(`  ${preview}`);
    }
  }

  // レポート保存
  const reportDir = path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'test-reports');
  await fs.mkdir(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
  const reportPath = path.join(reportDir, `${timestamp}.json`);

  const report = {
    version: scenariosData.version,
    timestamp: new Date().toISOString(),
    filters: { id: filterId, tags: tagFilters },
    debug,
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    },
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  // サマリー
  console.log('');
  console.log('─'.repeat(60));
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                    テスト結果サマリー                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  const passed = report.summary.passed;
  const total = report.summary.total;
  const failed = report.summary.failed;

  console.log(`  合計: ${total} シナリオ`);
  console.log(`  ✅ 成功: ${passed}`);
  console.log(`  ❌ 失敗: ${failed}`);
  console.log('');
  console.log(`  レポート: ${reportPath}`);
  console.log('');

  // 失敗シナリオの詳細
  if (failed > 0) {
    console.log('─'.repeat(60));
    console.log('');
    console.log('失敗したシナリオ:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name} [${r.scenario}]`);
      if (r.error) {
        console.log(`    Error: ${r.error}`);
      }
      if (r.details?.checks) {
        r.details.checks.filter(c => !c.passed).forEach(c => {
          console.log(`    ${c.name}: ${JSON.stringify(c.actual)}`);
        });
      }
    });
    console.log('');
  }

  // 終了コード
  if (failed > 0) {
    console.log(`結果: ❌ ${failed} シナリオが失敗`);
    process.exit(1);
  } else {
    console.log(`結果: ✅ 全シナリオ成功`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
