#!/usr/bin/env node
/**
 * CDPスナップショット - コマンドラインツール
 *
 * 新しい接続を作成してページの状態を確認する。
 * MCPサーバーとは独立して動作する（デバッグ用）。
 *
 * 使い方:
 *   npm run cdp:chatgpt          # ChatGPTの状態を確認
 *   npm run cdp:gemini           # Geminiの状態を確認
 *   npm run cdp:chatgpt:ss       # スクリーンショット付き
 */

import {connectViaExtensionRaw} from '../build/src/fast-cdp/extension-raw.js';
import {CdpClient} from '../build/src/fast-cdp/cdp-client.js';

const target = process.argv[2] || 'chatgpt';
const includeScreenshot = process.argv.includes('--screenshot') || process.argv.includes('-s');

if (target !== 'chatgpt' && target !== 'gemini') {
  console.error('Usage: cdp-snapshot.mjs <chatgpt|gemini> [--screenshot]');
  process.exit(1);
}

const targetUrl = target === 'chatgpt'
  ? 'https://chatgpt.com/'
  : 'https://gemini.google.com/';

async function main() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  CDP Snapshot: ${target}`);
  console.log(`${'='.repeat(50)}\n`);

  // 接続を作成
  console.log('[1] 接続中...');
  console.log(`    Target URL: ${targetUrl}`);

  let client;
  try {
    const result = await connectViaExtensionRaw({
      tabUrl: targetUrl,
      newTab: false,  // 既存タブを使う
      timeoutMs: 10000,
    });

    console.log('    ✅ 接続成功');
    if (result.targetInfo) {
      console.log(`    Target: ${result.targetInfo.url}`);
    }

    client = new CdpClient(result.relay);
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Page.enable');
  } catch (error) {
    console.log(`    ❌ 接続失敗: ${error.message}`);
    console.log('\n    Chrome拡張機能が有効で、Chromeが開いていることを確認してください。');
    process.exit(1);
  }

  // スナップショット取得
  console.log('\n[2] ページ情報取得中...\n');

  try {
    // 基本情報
    const basicInfo = await client.evaluate(`
      ({
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        elementCount: document.querySelectorAll('*').length,
      })
    `);

    console.log('## Page Info');
    console.log(`  URL:           ${basicInfo.url}`);
    console.log(`  Title:         ${basicInfo.title}`);
    console.log(`  Ready State:   ${basicInfo.readyState}`);
    console.log(`  Element Count: ${basicInfo.elementCount}`);

    // ChatGPT/Gemini固有の情報
    if (target === 'chatgpt') {
      const state = await client.evaluate(`
        (() => {
          const textarea = document.querySelector('textarea#prompt-textarea') ||
                          document.querySelector('textarea[data-testid="prompt-textarea"]');
          const prosemirror = document.querySelector('.ProseMirror[contenteditable="true"]');
          const sendBtn = document.querySelector('button[data-testid="send-button"]');
          const stopBtn = document.querySelector('button[data-testid="stop-button"]');
          const userMsgs = document.querySelectorAll('[data-message-author-role="user"]');
          const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');

          let inputFound = false;
          let inputValue = '';
          let inputSelector = '';
          if (textarea) {
            inputFound = true;
            inputValue = textarea.value || '';
            inputSelector = textarea.id ? '#' + textarea.id : 'textarea';
          } else if (prosemirror) {
            inputFound = true;
            inputValue = prosemirror.textContent || '';
            inputSelector = '.ProseMirror';
          }

          return {
            inputFound,
            inputValue: inputValue.slice(0, 100),
            inputSelector,
            sendButtonFound: !!sendBtn,
            sendButtonDisabled: sendBtn ? (sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true') : null,
            stopButtonFound: !!stopBtn,
            userMsgCount: userMsgs.length,
            assistantMsgCount: assistantMsgs.length,
            hasLoginPrompt: document.body?.innerText?.includes('ログイン') && !inputFound,
          };
        })()
      `);

      console.log('\n## Input Field');
      console.log(`  Found:    ${state.inputFound ? '✅ Yes' : '❌ No'}`);
      if (state.inputSelector) {
        console.log(`  Selector: ${state.inputSelector}`);
      }
      console.log(`  Value:    "${state.inputValue || '(empty)'}"`);

      console.log('\n## Buttons');
      console.log(`  Send:     ${state.sendButtonFound ? '✅ Found' : '❌ Not found'} ${state.sendButtonDisabled ? '(disabled)' : ''}`);
      console.log(`  Stop:     ${state.stopButtonFound ? '⚠️ Visible (generating)' : 'Not visible'}`);

      console.log('\n## Messages');
      console.log(`  User:      ${state.userMsgCount}`);
      console.log(`  Assistant: ${state.assistantMsgCount}`);

      if (state.hasLoginPrompt) {
        console.log('\n⚠️ ログインが必要な可能性があります');
      }

    } else {
      // Gemini
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
                    if (!seen.has(el)) { seen.add(el); results.push(el); }
                  });
                } catch {}
              }
              const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
              for (const el of elements) { if (el.shadowRoot) visit(el.shadowRoot); }
            };
            visit(document);
            return results;
          };

          const textbox = collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea'])[0];
          const buttons = collectDeep(['button[aria-label*="Send"]', 'button[aria-label*="送信"]']);
          const userMsgs = collectDeep(['user-query', '.user-query', '[data-message-author-role="user"]']);
          const assistantMsgs = collectDeep(['model-response', '.model-response']);

          return {
            inputFound: !!textbox,
            inputValue: textbox ? (textbox.isContentEditable ? textbox.innerText : textbox.value || '').slice(0, 100) : '',
            sendButtonFound: buttons.length > 0,
            userMsgCount: userMsgs.length,
            assistantMsgCount: assistantMsgs.length,
          };
        })()
      `);

      console.log('\n## Input Field');
      console.log(`  Found:    ${state.inputFound ? '✅ Yes' : '❌ No'}`);
      console.log(`  Value:    "${state.inputValue || '(empty)'}"`);

      console.log('\n## Send Button');
      console.log(`  Found:    ${state.sendButtonFound ? '✅ Yes' : '❌ No'}`);

      console.log('\n## Messages');
      console.log(`  User:      ${state.userMsgCount}`);
      console.log(`  Assistant: ${state.assistantMsgCount}`);
    }

    // Body テキスト（先頭部分）
    const bodyText = await client.evaluate(`
      document.body?.innerText?.slice(0, 300) || "(empty)"
    `);
    console.log('\n## Body Text (excerpt)');
    console.log('-'.repeat(50));
    console.log(bodyText);
    console.log('-'.repeat(50));

    // スクリーンショット
    if (includeScreenshot) {
      console.log('\n[3] スクリーンショット撮影中...');
      try {
        const screenshot = await client.send('Page.captureScreenshot', {format: 'png'});
        if (screenshot?.data) {
          const fs = await import('fs');
          const path = `/tmp/cdp-snapshot-${target}-${Date.now()}.png`;
          fs.writeFileSync(path, Buffer.from(screenshot.data, 'base64'));
          console.log(`    ✅ Saved: ${path}`);
        }
      } catch (ssErr) {
        console.log(`    ❌ Failed: ${ssErr.message}`);
      }
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('  Done');
  console.log(`${'='.repeat(50)}\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
