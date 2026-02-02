#!/usr/bin/env node
/**
 * DOM構造確認スクリプト
 *
 * Usage:
 *   node scripts/check-dom.mjs            # ChatGPT (デフォルト)
 *   node scripts/check-dom.mjs chatgpt    # ChatGPT
 *   node scripts/check-dom.mjs gemini     # Gemini
 *
 * Thinkingモードの応答抽出問題をデバッグするためのスクリプト。
 * 実際のDOM構造を確認し、どのセレクターでテキストが取得できるか調査する。
 */

import {chromium} from 'playwright';

const target = process.argv[2] || 'chatgpt';
const targetDomain = target === 'gemini' ? 'gemini.google.com' : 'chatgpt.com';

async function main() {
  console.log(`\n=== DOM Structure Check for ${target.toUpperCase()} ===\n`);

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch (error) {
    console.error('Failed to connect to Chrome. Make sure Chrome is running with --remote-debugging-port=9222');
    process.exit(1);
  }

  const contexts = browser.contexts();
  console.log(`Found ${contexts.length} browser contexts`);

  let found = false;

  for (const context of contexts) {
    const pages = context.pages();
    for (const page of pages) {
      const url = page.url();
      if (!url.includes(targetDomain)) continue;

      found = true;
      console.log(`\nPage URL: ${url}`);
      console.log(`Title: ${await page.title()}`);

      if (target === 'chatgpt') {
        await analyzeChatGPT(page);
      } else {
        await analyzeGemini(page);
      }

      break;
    }
    if (found) break;
  }

  if (!found) {
    console.error(`\nNo ${target.toUpperCase()} page found. Please open ${targetDomain} in Chrome.`);
  }

  await browser.close();
}

async function analyzeChatGPT(page) {
  // 基本統計
  const stats = await page.evaluate(() => {
    return {
      articles: document.querySelectorAll('article').length,
      assistantMsgs: document.querySelectorAll('[data-message-author-role="assistant"]').length,
      markdowns: document.querySelectorAll('.markdown').length,
      resultThinking: document.querySelectorAll('.result-thinking').length,
      prose: document.querySelectorAll('.prose').length,
    };
  });
  console.log('\n--- Basic Stats ---');
  console.log(JSON.stringify(stats, null, 2));

  // Thinkingモード状態チェック
  const thinkingState = await page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    return {
      hasGeneratingText:
        bodyText.includes('回答を生成しています') ||
        bodyText.includes('is still generating') ||
        bodyText.includes('generating a response'),
      hasThinkingComplete: /思考時間[：:]\s*\d+s?/.test(bodyText) || /Thinking.*\d+s?/.test(bodyText),
      hasStopButton: !!document.querySelector('button[data-testid="stop-button"]'),
    };
  });
  console.log('\n--- Thinking Mode State ---');
  console.log(JSON.stringify(thinkingState, null, 2));

  // 最後のアシスタントメッセージの詳細
  const lastAssistant = await page.evaluate(() => {
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (msgs.length === 0) return null;

    const last = msgs[msgs.length - 1];
    const markdowns = last.querySelectorAll('.markdown');
    const mdDetails = [];
    for (const md of markdowns) {
      mdDetails.push({
        className: md.className,
        isResultThinking: md.classList.contains('result-thinking'),
        innerTextLength: (md.innerText || '').length,
        textContentLength: (md.textContent || '').length,
        innerTextPreview: (md.innerText || '').substring(0, 100),
        textContentPreview: (md.textContent || '').substring(0, 100),
      });
    }

    // button以外のp要素
    const paragraphs = last.querySelectorAll('p');
    const pDetails = [];
    for (let i = 0; i < Math.min(paragraphs.length, 5); i++) {
      const p = paragraphs[i];
      pDetails.push({
        inButton: !!p.closest('button'),
        innerTextLength: (p.innerText || '').length,
        innerTextPreview: (p.innerText || '').substring(0, 50),
      });
    }

    return {
      tagName: last.tagName,
      className: last.className,
      innerTextLength: (last.innerText || '').length,
      markdowns: mdDetails,
      paragraphs: pDetails,
    };
  });
  console.log('\n--- Last Assistant Message ---');
  console.log(JSON.stringify(lastAssistant, null, 2));

  // セレクター別テキスト取得テスト
  const selectorTest = await page.evaluate(() => {
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (msgs.length === 0) return {};

    const last = msgs[msgs.length - 1];
    const results = {};

    // テストするセレクター
    const selectors = [
      '.markdown:not(.result-thinking)',
      '.result-thinking',
      '.result-thinking.markdown',
      '.prose:not(.result-thinking)',
      '[class*="markdown"]:not(.result-thinking)',
      '.whitespace-pre-wrap',
      'p:not(button p)',
    ];

    for (const sel of selectors) {
      try {
        const elem = last.querySelector(sel);
        if (elem) {
          results[sel] = {
            found: true,
            innerTextLength: (elem.innerText || '').length,
            textContentLength: (elem.textContent || '').length,
            preview: (elem.innerText || elem.textContent || '').substring(0, 80),
          };
        } else {
          results[sel] = {found: false};
        }
      } catch {
        results[sel] = {error: 'Invalid selector'};
      }
    }

    return results;
  });
  console.log('\n--- Selector Test Results ---');
  for (const [sel, result] of Object.entries(selectorTest)) {
    const status = result.found ? (result.innerTextLength > 0 ? 'OK' : 'EMPTY') : 'NOT_FOUND';
    console.log(`  ${sel}: ${status}`);
    if (result.found && result.preview) {
      console.log(`    Preview: "${result.preview}..."`);
    }
  }

  // 最後のarticleの詳細
  const lastArticle = await page.evaluate(() => {
    const articles = document.querySelectorAll('article');
    if (articles.length === 0) return null;

    // ChatGPT articleを探す
    let lastChatGPT = null;
    for (const article of articles) {
      const heading = article.querySelector('h6, h5, [role="heading"]');
      if (heading && (heading.textContent || '').includes('ChatGPT')) {
        lastChatGPT = article;
      }
    }

    if (!lastChatGPT) return null;

    return {
      heading:
        lastChatGPT.querySelector('h6, h5, [role="heading"]')?.textContent || '',
      innerTextLength: (lastChatGPT.innerText || '').length,
      innerTextPreview: (lastChatGPT.innerText || '').substring(0, 200),
      childDivs: lastChatGPT.querySelectorAll(':scope > div').length,
    };
  });
  console.log('\n--- Last ChatGPT Article ---');
  console.log(JSON.stringify(lastArticle, null, 2));
}

async function analyzeGemini(page) {
  const stats = await page.evaluate(() => {
    return {
      modelResponses: document.querySelectorAll('[data-test-id="model-response"]').length,
      messageContents: document.querySelectorAll('[data-message-content]').length,
      markdowns: document.querySelectorAll('.markdown').length,
    };
  });
  console.log('\n--- Basic Stats ---');
  console.log(JSON.stringify(stats, null, 2));

  const lastResponse = await page.evaluate(() => {
    const responses = document.querySelectorAll('[data-test-id="model-response"]');
    if (responses.length === 0) return null;

    const last = responses[responses.length - 1];
    return {
      innerTextLength: (last.innerText || '').length,
      innerTextPreview: (last.innerText || '').substring(0, 200),
    };
  });
  console.log('\n--- Last Model Response ---');
  console.log(JSON.stringify(lastResponse, null, 2));
}

main().catch(console.error);
