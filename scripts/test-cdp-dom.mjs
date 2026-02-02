#!/usr/bin/env node
/**
 * CDPのDOM APIを直接テストするスクリプト
 * Runtime.evaluateの代わりにDOM.getDocumentとDOM.getOuterHTMLを使用
 */

import '../scripts/browser-globals-mock.mjs';
import {getClient} from '../build/src/fast-cdp/fast-chat.js';

async function testCdpDom() {
  console.log('=== CDP DOM API テスト ===\n');

  // ChatGPTに接続
  console.log('[1] ChatGPTに接続中...');
  const client = await getClient('chatgpt');
  console.log('[1] 接続完了\n');

  // 方法1: Runtime.evaluate (現行方式)
  console.log('[2] Runtime.evaluate でテキスト取得...');
  const evalResult = await client.evaluate(`
    (() => {
      const articles = document.querySelectorAll('article');
      const results = [];
      for (const article of articles) {
        const heading = article.querySelector('h5, h6');
        const markdown = article.querySelector('.markdown');
        const p = article.querySelector('p');
        results.push({
          heading: heading?.textContent?.slice(0, 20),
          markdownInnerText: (markdown?.innerText || '').slice(0, 50),
          markdownTextContent: (markdown?.textContent || '').slice(0, 50),
          pInnerText: (p?.innerText || '').slice(0, 50),
          pTextContent: (p?.textContent || '').slice(0, 50),
        });
      }
      return { articleCount: articles.length, articles: results };
    })()
  `);
  console.log('[2] Runtime.evaluate 結果:');
  console.log(JSON.stringify(evalResult, null, 2));
  console.log();

  // 方法2: DOM.getDocument + DOM.querySelector
  console.log('[3] DOM API でテキスト取得...');
  try {
    // まずDOMを有効化
    await client.send('DOM.enable');

    // ドキュメントルートを取得
    const docResult = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    console.log('[3] DOM.getDocument nodeId:', docResult?.root?.nodeId);

    // querySelectorで.markdownを探す
    const queryResult = await client.send('DOM.querySelectorAll', {
      nodeId: docResult?.root?.nodeId,
      selector: '.markdown'
    });
    console.log('[3] .markdown nodes:', queryResult?.nodeIds?.length);

    // 各.markdownのouterHTMLを取得
    if (queryResult?.nodeIds?.length > 0) {
      for (const nodeId of queryResult.nodeIds) {
        const htmlResult = await client.send('DOM.getOuterHTML', { nodeId });
        console.log(`[3] nodeId ${nodeId} outerHTML:`, (htmlResult?.outerHTML || '').slice(0, 200));
      }
    }

    // articleも試す
    const articleResult = await client.send('DOM.querySelectorAll', {
      nodeId: docResult?.root?.nodeId,
      selector: 'article'
    });
    console.log('[3] article nodes:', articleResult?.nodeIds?.length);

    if (articleResult?.nodeIds?.length > 0) {
      const lastArticleId = articleResult.nodeIds[articleResult.nodeIds.length - 1];
      const htmlResult = await client.send('DOM.getOuterHTML', { nodeId: lastArticleId });
      console.log(`[3] last article outerHTML (first 500 chars):`, (htmlResult?.outerHTML || '').slice(0, 500));
    }

  } catch (err) {
    console.error('[3] DOM API エラー:', err.message);
  }

  // 方法3: Runtime.evaluate with userGesture (試験的)
  console.log('\n[4] Runtime.evaluate with userGesture...');
  try {
    const result2 = await client.send('Runtime.evaluate', {
      expression: `document.querySelector('.markdown')?.innerText`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    console.log('[4] userGesture結果:', result2?.result?.value);
  } catch (err) {
    console.error('[4] userGesture エラー:', err.message);
  }

  // 方法4: Page.bringToFront でタブをアクティブにしてから再取得
  console.log('\n[5] Page.bringToFront + 待機後に再取得...');
  try {
    await client.send('Page.enable');
    await client.send('Page.bringToFront');
    console.log('[5] Page.bringToFront 完了、3秒待機...');
    await new Promise(r => setTimeout(r, 3000));

    const result3 = await client.evaluate(`
      (() => {
        const md = document.querySelector('.markdown');
        const p = md?.querySelector('p');
        return {
          mdInnerText: (md?.innerText || '').slice(0, 100),
          mdTextContent: (md?.textContent || '').slice(0, 100),
          mdInnerHTML: (md?.innerHTML || '').slice(0, 200),
          pInnerText: (p?.innerText || '').slice(0, 100),
          pTextContent: (p?.textContent || '').slice(0, 100),
        };
      })()
    `);
    console.log('[5] bringToFront後の結果:', JSON.stringify(result3, null, 2));
  } catch (err) {
    console.error('[5] bringToFront エラー:', err.message);
  }

  // 方法5: scrollIntoViewでコンテンツを可視化
  console.log('\n[6] scrollIntoView + 待機後に再取得...');
  try {
    await client.evaluate(`
      (() => {
        const md = document.querySelector('.markdown');
        if (md) md.scrollIntoView({ block: 'center', behavior: 'instant' });
      })()
    `);
    console.log('[6] scrollIntoView完了、1秒待機...');
    await new Promise(r => setTimeout(r, 1000));

    const result4 = await client.evaluate(`
      (() => {
        const md = document.querySelector('.markdown');
        const p = md?.querySelector('p');
        // firstChildを直接確認
        const firstChild = p?.firstChild;
        return {
          mdInnerText: (md?.innerText || '').slice(0, 100),
          pFirstChildType: firstChild?.nodeType,
          pFirstChildValue: (firstChild?.nodeValue || firstChild?.textContent || '').slice(0, 100),
          pChildNodes: p?.childNodes?.length,
        };
      })()
    `);
    console.log('[6] scrollIntoView後の結果:', JSON.stringify(result4, null, 2));
  } catch (err) {
    console.error('[6] scrollIntoView エラー:', err.message);
  }

  console.log('\n=== テスト完了 ===');
  process.exit(0);
}

testCdpDom().catch(err => {
  console.error('テスト失敗:', err);
  process.exit(1);
});
