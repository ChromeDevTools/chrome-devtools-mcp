#!/usr/bin/env node
/**
 * DOM構造を探索するスクリプト
 * ChatGPT/GeminiのUIセレクターを調査する
 */

import {getClient, getPageDom} from '../build/src/fast-cdp/fast-chat.js';

const target = process.argv[2] || 'chatgpt';
const customSelectors = process.argv.slice(3);

async function exploreDom() {
  console.error(`\n=== ${target.toUpperCase()} DOM探索 ===\n`);

  try {
    const client = await getClient(target);
    console.error('接続成功\n');

    // デフォルトの探索セレクター
    const defaultSelectors = target === 'chatgpt'
      ? [
          // メッセージ関連
          '[data-message-author-role]',
          '[data-message-id]',
          'article',
          '.agent-turn',
          '.user-turn',
          '.message',
          // コンテナ
          '[class*="conversation"]',
          '[class*="thread"]',
          'main',
          // 入力関連
          '.ProseMirror',
          'textarea',
          '[data-testid="send-button"]',
          '[data-testid="stop-button"]',
        ]
      : [
          // Gemini用
          'model-response',
          'user-query',
          '[role="textbox"]',
          'div[contenteditable="true"]',
        ];

    const selectors = customSelectors.length > 0 ? customSelectors : defaultSelectors;

    console.error('調査するセレクター:', selectors.join(', '));
    console.error('');

    // 各セレクターで要素を取得
    for (const selector of selectors) {
      const result = await client.evaluate(`
        (() => {
          const els = document.querySelectorAll(${JSON.stringify(selector)});
          return {
            count: els.length,
            samples: Array.from(els).slice(0, 3).map(el => ({
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              classes: el.className?.split?.(' ')?.slice(0, 5) || [],
              attrs: Object.fromEntries(
                Array.from(el.attributes || [])
                  .filter(a => a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label')
                  .slice(0, 5)
                  .map(a => [a.name, a.value.slice(0, 50)])
              ),
              text: (el.textContent || '').slice(0, 100).replace(/\\s+/g, ' ').trim(),
            })),
          };
        })()
      `);

      if (result.count > 0) {
        console.error(`✅ ${selector}: ${result.count}件`);
        for (const sample of result.samples) {
          console.error(`   <${sample.tag}> ${sample.id ? '#' + sample.id : ''} .${sample.classes.join('.')}`);
          if (Object.keys(sample.attrs).length > 0) {
            console.error(`      attrs: ${JSON.stringify(sample.attrs)}`);
          }
          if (sample.text) {
            console.error(`      text: "${sample.text.slice(0, 60)}..."`);
          }
        }
      } else {
        console.error(`❌ ${selector}: 0件`);
      }
      console.error('');
    }

    // ページ全体の構造も確認
    console.error('=== ページ構造（main内） ===');
    const structure = await client.evaluate(`
      (() => {
        const main = document.querySelector('main') || document.body;
        const walk = (el, depth = 0) => {
          if (depth > 3) return [];
          const children = Array.from(el.children || []);
          return children.slice(0, 5).map(child => ({
            tag: child.tagName.toLowerCase(),
            classes: (child.className || '').split(' ').filter(c => c).slice(0, 3),
            attrs: Object.fromEntries(
              Array.from(child.attributes || [])
                .filter(a => a.name.startsWith('data-') || a.name === 'role')
                .slice(0, 3)
                .map(a => [a.name, a.value.slice(0, 30)])
            ),
            childCount: child.children?.length || 0,
          }));
        };
        return walk(main);
      })()
    `);

    for (const el of structure) {
      console.error(`  <${el.tag}> .${el.classes.join('.')} [${el.childCount} children]`);
      if (Object.keys(el.attrs).length > 0) {
        console.error(`    ${JSON.stringify(el.attrs)}`);
      }
    }

  } catch (err) {
    console.error('エラー:', err.message);
    process.exit(1);
  }
}

exploreDom();
