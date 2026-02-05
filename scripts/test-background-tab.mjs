#!/usr/bin/env node
/**
 * バックグラウンドタブ検証スクリプト
 *
 * バックグラウンドタブでも DOM 更新（textLen 増加）が継続する成立条件を調査する。
 *
 * 処理フロー:
 * 1. CDP で対象ページに接続
 * 2. bringToFront でフォアグラウンドに
 * 3. 質問を送信
 * 4. 停止ボタン検出（生成開始確認）
 * 5. --delay または --min-textlen の条件を満たすまで待機
 * 6. Target.createTarget で新規タブを作成 → フォーカスが奪われる
 * 7. バックグラウンド状態で1秒ごとにDOM状態を取得
 * 8. textLen の変化を記録・判定
 *
 * 使い方:
 *   npm run test:bg                          # Gemini バックグラウンドテスト
 *   npm run test:bg -- --skip-background     # バックグラウンド化をスキップ（比較用）
 *   npm run test:bg -- --target=chatgpt      # ChatGPT でテスト
 *   npm run test:bg -- --duration=60         # 60秒間モニタリング
 *   npm run test:bg -- --long                # 長い回答を期待する質問を使用
 *   npm run test:bg -- --delay=5             # 停止ボタン検出後、5秒待ってからバックグラウンド化
 *   npm run test:bg -- --min-textlen=500     # textLen >= 500 になってからバックグラウンド化
 */

import {getClient} from '../build/src/fast-cdp/fast-chat.js';

// コマンドライン引数をパース
const args = process.argv.slice(2);
const skipBackground = args.includes('--skip-background');
const targetArg = args.find(a => a.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : 'gemini';
const durationArg = args.find(a => a.startsWith('--duration='));
const duration = durationArg ? parseInt(durationArg.split('=')[1], 10) : 15;

// 新規オプション: 成立条件調査用
const useLongQuestion = args.includes('--long');
const delayArg = args.find(a => a.startsWith('--delay='));
const delay = delayArg ? parseInt(delayArg.split('=')[1], 10) : 0;
const minTextLenArg = args.find(a => a.startsWith('--min-textlen='));
const minTextLen = minTextLenArg ? parseInt(minTextLenArg.split('=')[1], 10) : 0;

// Emulate.setFocusEmulationEnabled の検証用
const emulateFocus = args.includes('--emulate-focus');

// ヘルプ表示
if (args.includes('--help') || args.includes('-h')) {
  console.error(`
バックグラウンドタブ検証スクリプト - 成立条件調査

使い方:
  npm run test:bg [オプション]

オプション:
  --target=gemini|chatgpt   対象サービス（デフォルト: gemini）
  --duration=N              モニタリング時間（秒、デフォルト: 15）
  --skip-background         バックグラウンド化をスキップ（比較用）
  --long                    長い回答を期待する質問を使用
  --delay=N                 停止ボタン検出後、N秒待ってからバックグラウンド化
  --min-textlen=N           textLen >= N になってからバックグラウンド化
  --emulate-focus           Emulate.setFocusEmulationEnabled(true) を使用
  --help, -h                このヘルプを表示

テスト例:
  # フォアグラウンドベースライン
  npm run test:bg -- --long --skip-background --duration=60

  # delay テスト
  npm run test:bg -- --long --delay=0 --duration=60
  npm run test:bg -- --long --delay=5 --duration=60
  npm run test:bg -- --long --delay=10 --duration=60

  # min-textlen テスト
  npm run test:bg -- --long --min-textlen=500 --duration=60
  npm run test:bg -- --long --min-textlen=1000 --duration=60

  # Emulate.setFocusEmulationEnabled テスト
  npm run test:bg -- --long --delay=5 --duration=30 --emulate-focus
`);
  process.exit(0);
}

/**
 * 質問を生成
 * @param {boolean} long - 長い回答を期待する質問を生成するか
 */
function generateQuestion(long = false) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const randomId = Math.random().toString(36).slice(2, 8).toUpperCase();

  if (long) {
    // より複雑な質問：複数のデータ構造の比較と実装
    return `ID:${randomId} (${timestamp}): Write a comprehensive comparison of the following data structures in JavaScript with full implementation code for each:

1. **Binary Search Tree (BST)**
   - Node class with left/right children
   - Insert, search, delete (all 3 cases), in-order/pre-order/post-order traversal
   - Time complexity analysis for each operation

2. **AVL Tree (Self-balancing BST)**
   - Balance factor calculation
   - Left rotation, right rotation, left-right rotation, right-left rotation
   - Rebalancing after insert/delete

3. **Red-Black Tree**
   - Color properties and rules
   - Insertion with recoloring and rotation
   - Why it's preferred over AVL in certain cases

4. **B-Tree (Order 3)**
   - Node structure with multiple keys
   - Split and merge operations
   - Use cases in databases

For each data structure, provide:
- Complete JavaScript class implementation with all methods
- Example usage with test cases
- Performance comparison table
- When to use each structure

This should be a comprehensive 3000+ word tutorial.`;
  }

  return `ID:${randomId} (${timestamp}): Explain the concept of closures in JavaScript in 2-3 sentences.`;
}

/**
 * DOM状態を取得する式 (共通)
 */
const DOM_UTILS_CODE = `
  const __isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const __collectDeep = (selectors) => {
    const nodes = [];
    const seen = new WeakSet();

    const walk = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);

      for (const sel of selectors) {
        try {
          const matches = root.querySelectorAll(sel);
          for (const m of matches) {
            if (!seen.has(m)) {
              nodes.push(m);
              seen.add(m);
            }
          }
        } catch {}
      }

      // Shadow DOM
      if (root.shadowRoot) walk(root.shadowRoot);
      for (const child of root.children || []) {
        walk(child);
      }
    };

    walk(document);
    return {nodes};
  };
`;

/**
 * Gemini の DOM 状態を取得
 */
async function getGeminiState(client) {
  return client.evaluate(`
    (() => {
      ${DOM_UTILS_CODE}

      const buttons = __collectDeep(['button', '[role="button"]']).nodes.filter(__isVisible);

      // 停止ボタン検出
      const hasStopButton = buttons.some(b => {
        const label = (b.getAttribute('aria-label') || '').trim();
        return label.includes('回答を停止') || label.includes('Stop generating') ||
               label.includes('Stop streaming') || label === 'Stop';
      }) || __collectDeep(['mat-icon[data-mat-icon-name="stop"]']).nodes.some(icon => {
        const btn = icon.closest('button');
        return btn && __isVisible(btn);
      });

      // フィードバックボタン検出（応答完了の証拠）
      const hasFeedbackButtons = __collectDeep([
        'img[alt="thumb_up"]',
        'img[alt="thumb_down"]',
        'img[alt="Good response"]',
        'img[alt="Bad response"]'
      ]).nodes.length > 0;

      // 最後の応答のテキスト長を取得
      const allResponses = __collectDeep(['model-response', '[data-test-id*="response"]', '.response', '.model-response']).nodes;
      const lastResponse = allResponses.length > 0 ? allResponses[allResponses.length - 1] : null;
      const textLen = lastResponse ? (lastResponse.innerText || '').length : 0;

      // 入力欄の状態
      const inputBox = document.querySelector('[role="textbox"][contenteditable="true"]') ||
                       document.querySelector('div[contenteditable="true"]');
      const inputEmpty = inputBox ? !(inputBox.textContent || '').trim() : true;

      return {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
        hasStopButton,
        hasFeedbackButtons,
        textLen,
        inputEmpty,
        responseCount: allResponses.length,
        timestamp: Date.now()
      };
    })()
  `);
}

/**
 * ChatGPT の DOM 状態を取得
 */
async function getChatGPTState(client) {
  return client.evaluate(`
    (() => {
      ${DOM_UTILS_CODE}

      // 停止ボタン検出
      const buttons = __collectDeep(['button', '[role="button"]']).nodes.filter(__isVisible);
      const hasStopButton = buttons.some(b => {
        const label = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        return label.includes('stop') || label.includes('中止');
      });

      // 応答完了検出（コピーボタンの存在）
      const hasFeedbackButtons = __collectDeep([
        'button[data-testid="copy-turn-action-button"]',
        '[data-testid="good-response-turn-action-button"]',
        '[data-testid="bad-response-turn-action-button"]'
      ]).nodes.some(__isVisible);

      // 最後の応答のテキスト長を取得
      const allResponses = __collectDeep([
        '[data-message-author-role="assistant"]',
        '.agent-turn',
        '[data-testid^="conversation-turn-"]'
      ]).nodes.filter(el => {
        // assistant のターンのみ
        const role = el.getAttribute('data-message-author-role');
        return role === 'assistant' || el.classList.contains('agent-turn');
      });
      const lastResponse = allResponses.length > 0 ? allResponses[allResponses.length - 1] : null;
      const textLen = lastResponse ? (lastResponse.innerText || '').length : 0;

      // 入力欄の状態
      const inputBox = document.querySelector('#prompt-textarea') ||
                       document.querySelector('[data-testid="composer-background"]');
      const inputEmpty = inputBox ? !(inputBox.textContent || '').trim() : true;

      return {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
        hasStopButton,
        hasFeedbackButtons,
        textLen,
        inputEmpty,
        responseCount: allResponses.length,
        timestamp: Date.now()
      };
    })()
  `);
}

/**
 * DOM状態を取得（対象に応じて分岐）
 */
async function getState(client, targetType) {
  if (targetType === 'chatgpt') {
    return getChatGPTState(client);
  }
  return getGeminiState(client);
}

/**
 * Gemini に質問を送信
 */
async function sendQuestionGemini(client, question) {
  // 入力欄を探してテキストを入力
  await client.evaluate(`
    (() => {
      const textbox = document.querySelector('[role="textbox"][contenteditable="true"]') ||
                      document.querySelector('div[contenteditable="true"]');
      if (textbox) {
        textbox.focus();
        textbox.textContent = '';
        document.execCommand('insertText', false, ${JSON.stringify(question)});
      }
    })()
  `);

  console.error('[Gemini] Text input completed');

  // 送信ボタンが有効になるまで待つ
  await new Promise(resolve => setTimeout(resolve, 500));

  // 送信ボタンをクリック
  const clicked = await client.evaluate(`
    (() => {
      const selectors = [
        'button[aria-label*="Send"]',
        'button[aria-label*="送信"]',
        'button[data-testid="send-button"]'
      ];

      // mat-icon での検索
      const sendIcon = document.querySelector('mat-icon[data-mat-icon-name="send"]');
      if (sendIcon) {
        const btn = sendIcon.closest('button');
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
      }

      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      return false;
    })()
  `);

  console.error(`[Gemini] Send button clicked: ${clicked}`);
  return clicked;
}

/**
 * ChatGPT に質問を送信
 */
async function sendQuestionChatGPT(client, question) {
  // 入力欄を探してテキストを入力
  await client.evaluate(`
    (() => {
      const textbox = document.querySelector('#prompt-textarea') ||
                      document.querySelector('[data-testid="composer-background"]');
      if (textbox) {
        textbox.focus();
        // ProseMirror エディタの場合
        const p = textbox.querySelector('p');
        if (p) {
          p.textContent = ${JSON.stringify(question)};
        } else {
          textbox.textContent = ${JSON.stringify(question)};
        }
        // 入力イベントを発火
        textbox.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    })()
  `);

  console.error('[ChatGPT] Text input completed');

  // 送信ボタンが有効になるまで待つ
  await new Promise(resolve => setTimeout(resolve, 500));

  // 送信ボタンをクリック
  const clicked = await client.evaluate(`
    (() => {
      const selectors = [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="送信"]'
      ];

      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      return false;
    })()
  `);

  console.error(`[ChatGPT] Send button clicked: ${clicked}`);
  return clicked;
}

/**
 * 質問を送信（対象に応じて分岐）
 */
async function sendQuestion(client, question, targetType) {
  if (targetType === 'chatgpt') {
    return sendQuestionChatGPT(client, question);
  }
  return sendQuestionGemini(client, question);
}

/**
 * メイン処理
 */
async function main() {
  const targetLabel = target === 'chatgpt' ? 'ChatGPT' : 'Gemini';

  console.error('');
  console.error('╔═══════════════════════════════════════════════════════════════╗');
  console.error(`║  ${targetLabel} バックグラウンドタブ検証                              ║`);
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`ターゲット: ${targetLabel}`);
  console.error(`モード: ${skipBackground ? 'フォアグラウンド維持（比較用）' : 'バックグラウンド化テスト'}`);
  console.error(`モニタリング時間: ${duration}秒`);
  console.error(`質問タイプ: ${useLongQuestion ? '長い回答を期待' : '短い回答'}`);
  if (delay > 0) {
    console.error(`待機時間: 停止ボタン検出後 ${delay}秒`);
  }
  if (minTextLen > 0) {
    console.error(`textLen 閾値: ${minTextLen}文字`);
  }
  if (emulateFocus) {
    console.error(`Emulate.setFocusEmulationEnabled: 有効`);
  }
  console.error('');

  const question = generateQuestion(useLongQuestion);
  console.error(`質問: "${question}"`);
  console.error('');

  // 1. CDP で対象ページに接続
  console.error(`[Phase 1] ${targetLabel} に接続中...`);
  const client = await getClient(target);
  console.error('[Phase 1] 接続完了');

  // Emulate.setFocusEmulationEnabled の設定（--emulate-focus オプション時）
  if (emulateFocus) {
    console.error('[Phase 1.5] Emulate.setFocusEmulationEnabled(true) を実行中...');
    try {
      await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      console.error('[Phase 1.5] setFocusEmulationEnabled 成功');
    } catch (e) {
      console.error(`[Phase 1.5] setFocusEmulationEnabled 失敗: ${e.message}`);
      console.error('[Phase 1.5] 注意: このコマンドは Chrome 93+ で利用可能');
    }
  }

  // 初期状態を取得
  const initialState = await getState(client, target);
  console.error(`[Initial] visibilityState=${initialState.visibilityState}, responseCount=${initialState.responseCount}`);

  // bringToFront で確実にフォアグラウンドに
  try {
    await client.send('Page.bringToFront');
    console.error('[Phase 2] Page.bringToFront 実行完了');
  } catch (e) {
    console.error(`[Phase 2] Page.bringToFront 失敗: ${e.message}`);
  }

  // 2. 質問を送信
  console.error('[Phase 3] 質問を送信中...');
  const sent = await sendQuestion(client, question, target);
  if (!sent) {
    console.error('[ERROR] 送信ボタンが見つからないか無効です');
    process.exit(1);
  }
  console.error('[Phase 3] 送信完了');

  // 4. 応答生成開始を待機してからバックグラウンド化
  if (!skipBackground) {
    console.error('[Phase 4] 応答生成開始を待機中...');
    let waitedForGeneration = 0;
    const maxWaitForGeneration = 10000; // 最大10秒

    while (waitedForGeneration < maxWaitForGeneration) {
      const state = await getState(client, target);
      if (state.hasStopButton) {
        console.error('[Phase 4] 停止ボタン検出 → 生成開始確認');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      waitedForGeneration += 500;
    }

    if (waitedForGeneration >= maxWaitForGeneration) {
      console.error('[Phase 4] 警告: 停止ボタンが検出されませんでした（タイムアウト）');
    }

    // 停止ボタン検出時点の状態を記録
    const stateAtStopButton = await getState(client, target);
    console.error(`[Phase 4] 停止ボタン検出時: textLen=${stateAtStopButton.textLen}`);

    // --delay オプション: 指定秒数待機
    if (delay > 0) {
      console.error(`[Phase 4] ${delay}秒間フォアグラウンドで待機...`);
      for (let i = 1; i <= delay; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const state = await getState(client, target);
        console.error(`  ${i}秒: textLen=${state.textLen}`);
      }
    }

    // --min-textlen オプション: textLen が閾値以上になるまで待機
    if (minTextLen > 0) {
      console.error(`[Phase 4] textLen >= ${minTextLen} まで待機中...`);
      const maxWaitForTextLen = 120000; // 最大120秒
      let waitedForTextLen = 0;
      while (waitedForTextLen < maxWaitForTextLen) {
        const state = await getState(client, target);
        console.error(`  textLen = ${state.textLen}`);
        if (state.textLen >= minTextLen) {
          console.error(`[Phase 4] textLen 閾値到達: ${state.textLen} >= ${minTextLen}`);
          break;
        }
        // 応答完了したらそれ以上待たない
        if (state.hasFeedbackButtons && !state.hasStopButton) {
          console.error(`[Phase 4] 応答完了（textLen=${state.textLen}は閾値未達だが続行）`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        waitedForTextLen += 1000;
      }
      if (waitedForTextLen >= maxWaitForTextLen) {
        console.error('[Phase 4] 警告: textLen 閾値待機がタイムアウト');
      }
    }

    // バックグラウンド化直前の状態を記録
    const stateBeforeBackground = await getState(client, target);
    console.error(`[Phase 4] バックグラウンド化直前: textLen=${stateBeforeBackground.textLen}`);

    console.error('[Phase 4] バックグラウンド化中（Target.createTarget で新規タブ作成）...');
    try {
      // CDP Target.createTarget を使用して新規タブを作成
      // これはポップアップブロッカーの影響を受けない
      const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
      console.error(`[Phase 4] 新規タブを開きました (targetId: ${targetId})`);
      console.error(`[Phase 4] ${targetLabel} タブはバックグラウンドへ`);
    } catch (e) {
      console.error(`[Phase 4] Target.createTarget 失敗: ${e.message}`);
      // フォールバック: window.open を試す
      console.error('[Phase 4] フォールバック: window.open を試行...');
      try {
        await client.evaluate(`window.open('about:blank', '_blank')`);
        console.error('[Phase 4] window.open で新規タブを開きました');
      } catch (e2) {
        console.error(`[Phase 4] window.open も失敗: ${e2.message}`);
      }
    }
  } else {
    console.error('[Phase 4] スキップ（フォアグラウンド維持モード）');
  }

  // バックグラウンド化時点の textLen を記録（skipBackground の場合は 0）
  let textLenAtBackground = 0;
  if (!skipBackground) {
    // Phase 4 で stateBeforeBackground を取得済みなのでその値を使用
    // 注: stateBeforeBackground は Phase 4 ブロック内で定義されているため、
    //     ここでは再取得が必要
    const currentState = await getState(client, target);
    textLenAtBackground = currentState.textLen;
  }

  // 5. 1秒ごとにDOM状態を取得
  console.error('');
  console.error('╔═══════════════════════════════════════════════════════════════╗');
  console.error(`║  DOM状態モニタリング開始（1秒間隔 × ${duration}回）                    ║`);
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error('');

  const samples = [];
  let lastTextLen = 0;
  let increaseCount = 0;
  let completedAt = null;

  // 緊急フォーカス回復機能
  const ZERO_TEXTLEN_THRESHOLD = 60; // textLen が 0 のまま 60秒で介入
  let zeroTextLenSeconds = 0;
  let focusRecoveryAttempted = false;

  for (let i = 1; i <= duration; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const state = await getState(client, target);
    samples.push(state);

    const textDelta = state.textLen - lastTextLen;
    if (textDelta > 0) {
      increaseCount++;
    }

    const status = state.hasStopButton ? '⏳ 生成中' : (state.hasFeedbackButtons ? '✅ 完了' : '⏸️ 待機');
    const focusStr = state.hasFocus ? 'F' : '-';

    console.error(
      `@${String(i).padStart(2)}s: ` +
      `vis=${state.visibilityState.padEnd(7)} ` +
      `focus=${focusStr} ` +
      `resp=${String(state.responseCount).padStart(2)} ` +
      `textLen=${String(state.textLen).padStart(5)} ` +
      `(+${String(textDelta).padStart(4)}) ` +
      `${status}`
    );

    // 緊急フォーカス回復: textLen === 0 が続く場合
    if (state.visibilityState === 'hidden' && !focusRecoveryAttempted) {
      if (state.textLen === 0) {
        zeroTextLenSeconds++;
        if (zeroTextLenSeconds >= ZERO_TEXTLEN_THRESHOLD) {
          console.error(`[Recovery] textLen=0 が ${ZERO_TEXTLEN_THRESHOLD}秒継続 → bringToFront を試行`);
          try {
            await client.send('Page.bringToFront');
            focusRecoveryAttempted = true;
            console.error('[Recovery] フォーカス回復完了、観察継続');
          } catch (e) {
            console.error(`[Recovery] bringToFront 失敗: ${e.message}`);
          }
        }
      } else {
        // textLen > 0 になったらカウンタリセット（回復不要）
        zeroTextLenSeconds = 0;
      }
    }

    lastTextLen = state.textLen;

    // 完了検出
    if (!completedAt && state.hasFeedbackButtons && !state.hasStopButton) {
      completedAt = i;
    }

    // 早期終了: 完了後に2サンプル追加で取得したら終了
    if (completedAt && i >= completedAt + 2) {
      console.error('[Early Exit] 応答完了を確認、モニタリング終了');
      break;
    }
  }

  // 6. フォーカス回復テスト（バックグラウンド化した場合のみ）
  const recoveryStartTextLen = samples[samples.length - 1]?.textLen || 0;
  const recoverySamples = [];

  if (!skipBackground) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  フォーカス回復テスト（bringToFront 後の変化）                 ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error('');

    try {
      await client.send('Page.bringToFront');
      console.error('[Recovery] Page.bringToFront 実行完了');
    } catch (e) {
      console.error(`[Recovery] bringToFront 失敗: ${e.message}`);
    }

    // 回復後 10 秒間サンプリング
    let recoveryLastTextLen = recoveryStartTextLen;
    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const state = await getState(client, target);
      recoverySamples.push(state);

      const textDelta = state.textLen - recoveryLastTextLen;
      const status = state.hasStopButton ? '⏳ 生成中' : (state.hasFeedbackButtons ? '✅ 完了' : '⏸️ 待機');
      const focusStr = state.hasFocus ? 'F' : '-';

      console.error(
        `[R+${String(i).padStart(2)}s]: ` +
        `vis=${state.visibilityState.padEnd(7)} ` +
        `focus=${focusStr} ` +
        `resp=${String(state.responseCount).padStart(2)} ` +
        `textLen=${String(state.textLen).padStart(5)} ` +
        `(+${String(textDelta).padStart(4)}) ` +
        `${status}`
      );

      recoveryLastTextLen = state.textLen;
    }
  }

  // 7. 結果判定
  console.error('');
  console.error('╔═══════════════════════════════════════════════════════════════╗');
  console.error('║  検証結果                                                      ║');
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error('');

  const finalState = samples[samples.length - 1];
  const recoveryFinalState = recoverySamples.length > 0 ? recoverySamples[recoverySamples.length - 1] : null;
  const wasBackground = samples.some(s => s.visibilityState === 'hidden');

  console.error(`サンプル数: ${samples.length}`);
  console.error(`バックグラウンド状態検出: ${wasBackground ? 'あり' : 'なし'}`);
  console.error(`バックグラウンド化時 textLen: ${textLenAtBackground}`);
  console.error(`textLen増加回数: ${increaseCount} / ${samples.length - 1}`);
  console.error(`バックグラウンド中 最終textLen: ${finalState.textLen}`);
  console.error(`応答完了: ${completedAt ? `${completedAt}秒目で検出` : '未検出'}`);
  console.error(`緊急フォーカス回復: ${focusRecoveryAttempted ? 'あり' : 'なし'}`);

  if (recoveryFinalState) {
    const recoveryTextIncrease = recoveryFinalState.textLen - recoveryStartTextLen;
    console.error('');
    console.error('--- フォーカス回復後 ---');
    console.error(`回復開始時 textLen: ${recoveryStartTextLen}`);
    console.error(`回復後 最終textLen: ${recoveryFinalState.textLen}`);
    console.error(`回復後の増加量: ${recoveryTextIncrease > 0 ? '+' : ''}${recoveryTextIncrease}`);
    console.error(`回復後 応答完了: ${recoveryFinalState.hasFeedbackButtons && !recoveryFinalState.hasStopButton ? 'はい' : 'いいえ'}`);
  }
  console.error('');
  console.error('--- 条件パラメータ ---');
  console.error(`delay: ${delay}秒`);
  console.error(`min-textlen: ${minTextLen}`);
  console.error(`long: ${useLongQuestion}`);
  console.error(`emulate-focus: ${emulateFocus}`);
  console.error('');

  // 判定
  if (wasBackground && increaseCount >= 3 && !focusRecoveryAttempted) {
    if (emulateFocus) {
      console.error('╔═══════════════════════════════════════════════════════════════╗');
      console.error('║  ✅ setFocusEmulationEnabled 有効: DOM更新継続！             ║');
      console.error('╚═══════════════════════════════════════════════════════════════╝');
      console.error('');
      console.error('結論: Emulation.setFocusEmulationEnabled(true) が効果的。');
      console.error('      フォーカスをエミュレートすることでバックグラウンドでもDOM更新継続。');
      console.error('      → 接続時に一度呼ぶだけで透明に動作する解決策。');
    } else {
      console.error('╔═══════════════════════════════════════════════════════════════╗');
      console.error('║  ✅ 仮説A 正しい: バックグラウンドでもDOM更新継続            ║');
      console.error('╚═══════════════════════════════════════════════════════════════╝');
      console.error('');
      console.error('結論: bringToFront を送信時に一度呼べば、その後バックグラウンドでも');
      console.error('      DOM更新は継続される。現状の実装で問題なし。');
    }
    process.exit(0);
  } else if (focusRecoveryAttempted && increaseCount >= 3) {
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  🔄 回復成功: フォーカス回復後にtextLen増加開始              ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('結論: バックグラウンドでは応答検出ができなかったが、bringToFront で回復。');
    console.error('      定期的な bringToFront が必要。');
    process.exit(1);
  } else if (wasBackground && increaseCount < 3) {
    if (emulateFocus) {
      console.error('╔═══════════════════════════════════════════════════════════════╗');
      console.error('║  ❌ setFocusEmulationEnabled は効果なし                       ║');
      console.error('╚═══════════════════════════════════════════════════════════════╝');
      console.error('');
      console.error('結論: Emulation.setFocusEmulationEnabled(true) でも DOM 更新停止。');
      console.error('      フォーカスのエミュレートは visibilityState に影響しない可能性。');
      console.error('      別ウィンドウアプローチまたは定期的な bringToFront が必要。');
    } else {
      console.error('╔═══════════════════════════════════════════════════════════════╗');
      console.error('║  ❌ 仮説B: バックグラウンドでDOM更新が停止                   ║');
      console.error('╚═══════════════════════════════════════════════════════════════╝');
      console.error('');
      console.error('結論: バックグラウンドタブでは DOM 更新が停止する。');
      console.error('      対策が必要（定期的な bringToFront、または別アプローチ）。');
    }
    process.exit(1);
  } else if (!wasBackground) {
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠️  バックグラウンド状態が検出されませんでした              ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error('');
    if (skipBackground) {
      console.error('--skip-background フラグが指定されているため、これは期待通りです。');
    } else {
      console.error('Target.createTarget / window.open が機能しなかった可能性があります。');
      console.error('手動で別タブに切り替えてテストしてください。');
    }
    process.exit(skipBackground ? 0 : 1);
  }
}

main().catch(err => {
  console.error('');
  console.error('╔═══════════════════════════════════════════════════════════════╗');
  console.error('║  Fatal Error                                                   ║');
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error(err);
  process.exit(1);
});
