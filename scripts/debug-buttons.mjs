#!/usr/bin/env node
/**
 * デバッグ用: Geminiのボタン状態確認スクリプト
 * 停止ボタンが誤検出されている問題を調査
 */

import { getClient } from '../build/src/fast-cdp/fast-chat.js';

async function main() {
  console.log('\n=== Gemini Button State Debug ===\n');

  try {
    // Geminiタブに接続
    const client = await getClient('gemini');

    console.log('Connected to Gemini tab');

    // ボタン状態を取得
    const state = await client.evaluate(`
      (() => {
        const collectDeep = (selectorList) => {
          const results = [];
          const seen = new Set();
          const visit = (root) => {
            if (!root) return;
            for (const sel of selectorList) {
              try {
                root.querySelectorAll?.(sel)?.forEach(el => {
                  if (!seen.has(el)) {
                    seen.add(el);
                    results.push(el);
                  }
                });
              } catch {}
            }
            const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
            for (const el of elements) {
              if (el.shadowRoot) visit(el.shadowRoot);
            }
          };
          visit(document);
          return results;
        };

        const isVisible = (el) => {
          if (!el) return false;
          const rects = el.getClientRects();
          if (!rects || rects.length === 0) return false;
          const style = window.getComputedStyle(el);
          return style && style.visibility !== 'hidden' && style.display !== 'none';
        };

        const isDisabled = (el) => {
          if (!el) return true;
          return (
            el.disabled ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.getAttribute('disabled') === 'true'
          );
        };

        // 全ボタン収集
        const allButtons = collectDeep(['button', '[role="button"]']);
        const visibleButtons = allButtons.filter(isVisible);
        const enabledButtons = visibleButtons.filter(el => !isDisabled(el));

        // 停止ボタン検出（方法1: aria-label）
        const stopByLabel = enabledButtons.filter(b => {
          const label = (b.getAttribute('aria-label') || '').trim();
          return label.includes('回答を停止') || label.includes('Stop generating') ||
                 label.includes('Stop streaming') || label === 'Stop';
        });

        // 停止アイコン検出（方法2: mat-icon）
        const stopIcons = collectDeep(['mat-icon[data-mat-icon-name="stop"]']);
        const stopIconButtons = [];
        for (const icon of stopIcons) {
          const btn = icon.closest('button');
          if (btn && isVisible(btn)) {
            stopIconButtons.push({
              visible: true,
              disabled: isDisabled(btn),
              ariaLabel: btn.getAttribute('aria-label'),
              className: btn.className,
            });
          }
        }

        // 送信ボタン検出
        let sendButton = enabledButtons.find(b =>
          (b.textContent || '').includes('プロンプトを送信') ||
          (b.textContent || '').includes('送信') ||
          (b.getAttribute('aria-label') || '').includes('送信') ||
          (b.getAttribute('aria-label') || '').includes('Send')
        );
        if (!sendButton) {
          sendButton = enabledButtons.find(
            b =>
              b.querySelector('mat-icon[data-mat-icon-name="send"]') ||
              b.querySelector('[data-icon="send"]')
          );
        }

        // マイクアイコン検出
        const micImgs = collectDeep(['img[alt="mic"]']);
        const micButtons = [];
        for (const img of micImgs) {
          const btn = img.closest('button');
          if (btn && isVisible(btn)) {
            micButtons.push({
              visible: true,
              disabled: isDisabled(btn),
              ariaLabel: btn.getAttribute('aria-label'),
            });
          }
        }

        // フィードバックボタン検出
        const feedbackImgs = collectDeep(['img[alt="thumb_up"]', 'img[alt="thumb_down"]']);

        // レスポンス要素
        const responses = collectDeep(['model-response', '[data-test-id*="response"]', '.response', '.model-response']);

        // 全ボタンの詳細
        const allButtonDetails = enabledButtons.slice(0, 15).map(b => ({
          ariaLabel: b.getAttribute('aria-label'),
          text: (b.textContent || '').trim().slice(0, 40),
          className: (b.className || '').slice(0, 50),
          hasMatIcon: !!b.querySelector('mat-icon'),
          matIconName: b.querySelector('mat-icon')?.getAttribute('data-mat-icon-name'),
        }));

        return {
          url: location.href,
          buttonCounts: {
            all: allButtons.length,
            visible: visibleButtons.length,
            enabled: enabledButtons.length,
          },
          stopButton: {
            byLabel: stopByLabel.map(b => ({
              ariaLabel: b.getAttribute('aria-label'),
              text: (b.textContent || '').trim().slice(0, 50),
            })),
            byIcon: stopIconButtons,
          },
          sendButton: sendButton ? {
            found: true,
            disabled: isDisabled(sendButton),
            ariaLabel: sendButton.getAttribute('aria-label'),
            text: (sendButton.textContent || '').trim().slice(0, 30),
          } : { found: false },
          micButtons,
          feedbackImgs: feedbackImgs.length,
          responseCount: responses.length,
          allButtonDetails,
        };
      })()
    `);

    console.log('\n--- Button State ---');
    console.log(JSON.stringify(state, null, 2));

    // 結論
    console.log('\n--- Analysis ---');
    const hasStopByLabel = state.stopButton.byLabel.length > 0;
    const hasStopByIcon = state.stopButton.byIcon.some(b => !b.disabled);
    const hasStopButton = hasStopByLabel || hasStopByIcon;

    console.log(`Stop button detected: ${hasStopButton}`);
    console.log(`  - By aria-label: ${hasStopByLabel}`);
    console.log(`  - By mat-icon: ${hasStopByIcon}`);
    console.log(`Send button: ${state.sendButton.found ? (state.sendButton.disabled ? 'disabled' : 'enabled') : 'not found'}`);
    console.log(`Mic buttons: ${state.micButtons.length}`);
    console.log(`Feedback buttons: ${state.feedbackImgs}`);
    console.log(`Responses: ${state.responseCount}`);

    if (hasStopButton) {
      console.log('\n!!! WARNING: Stop button is being detected !!!');
      console.log('This will cause the send button to be marked as disabled.');
    }

    await client.close();

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
