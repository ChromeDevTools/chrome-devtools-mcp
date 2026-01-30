#!/usr/bin/env node
/**
 * CDPが実際に何を見ているか確認するデバッグスクリプト
 */

import {connectViaExtensionRaw} from '../build/src/fast-cdp/extension-raw.js';
import {CdpClient} from '../build/src/fast-cdp/cdp-client.js';

async function main() {
  console.log('\n=== CDP View Debug ===\n');

  try {
    console.log('[1] ChatGPTに接続中...');
    const result = await connectViaExtensionRaw({
      tabUrl: 'https://chatgpt.com/',
      newTab: true,
      timeoutMs: 10000,
    });

    console.log('[2] 接続成功。targetInfo:', JSON.stringify(result.targetInfo, null, 2));

    const client = new CdpClient(result.relay);
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Page.enable');

    console.log('\n[3] CDPが見ているページ情報:');

    // URL
    const url = await client.evaluate('location.href');
    console.log('  URL:', url);

    // タイトル
    const title = await client.evaluate('document.title');
    console.log('  Title:', title);

    // Body の最初の500文字
    const bodyText = await client.evaluate('document.body?.innerText?.slice(0, 500) || "(empty)"');
    console.log('  Body (first 500 chars):', bodyText);

    // 入力欄の有無
    const hasInput = await client.evaluate(`
      !!document.querySelector('textarea#prompt-textarea') ||
      !!document.querySelector('.ProseMirror[contenteditable="true"]')
    `);
    console.log('  Has input field:', hasInput);

    // 送信ボタンの有無
    const hasSendButton = await client.evaluate(`
      !!document.querySelector('button[data-testid="send-button"]')
    `);
    console.log('  Has send button:', hasSendButton);

    console.log('\n[4] スクリーンショットを撮影...');
    const screenshot = await client.send('Page.captureScreenshot', {format: 'png'});
    if (screenshot?.data) {
      const fs = await import('fs');
      const path = '/tmp/cdp-debug-screenshot.png';
      fs.writeFileSync(path, Buffer.from(screenshot.data, 'base64'));
      console.log('  Screenshot saved:', path);
    }

    console.log('\n=== Debug Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

main();
