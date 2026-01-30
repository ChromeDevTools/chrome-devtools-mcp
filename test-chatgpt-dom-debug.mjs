#!/usr/bin/env node
/**
 * ChatGPT DOM構造デバッグスクリプト
 * 実際のセレクタを調査する
 */
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs'],
  env: { ...process.env }
});

const client = new Client({name: 'chatgpt-dom-debug', version: '0.0.0'});

console.log('[Debug] Connecting...');
await client.connect(transport);
console.log('[Debug] Connected\n');

try {
  // ChatGPTページに移動（既存タブ利用）
  console.log('[Debug] Navigating to ChatGPT...');
  const result = await client.callTool({
    name: 'ask_chatgpt_web',
    arguments: {
      question: 'Hello',
    },
  });

  console.log('[Debug] Got response, now inspecting DOM...\n');

  // DOM構造を調査
  const debugInfo = await client.callTool({
    name: 'evaluate_script',
    arguments: {
      function: `
        (() => {
          // 様々なセレクタを試す
          const selectors = [
            '[data-message-author-role="assistant"]',
            '[data-message-author-role="user"]',
            '.agent-turn',
            '.min-h-\\\\[20px\\\\]',
            'article',
            '[data-testid*="conversation"]',
            '[data-testid*="message"]',
            '.markdown',
            '.prose',
          ];

          const results = {};

          for (const sel of selectors) {
            try {
              const elements = document.querySelectorAll(sel);
              results[sel] = {
                count: elements.length,
                sample: elements.length > 0 ? {
                  tagName: elements[0].tagName,
                  className: elements[0].className,
                  textPreview: (elements[0].textContent || '').slice(0, 100),
                  hasDataAttrs: Array.from(elements[0].attributes || [])
                    .filter(attr => attr.name.startsWith('data-'))
                    .map(attr => attr.name + '=' + attr.value)
                } : null
              };
            } catch (err) {
              results[sel] = {error: err.message};
            }
          }

          // 最後のメッセージ要素を探す
          const allElements = document.querySelectorAll('*');
          const messageElements = [];

          for (const el of allElements) {
            const attrs = Array.from(el.attributes || []);
            const hasMessageAttr = attrs.some(attr =>
              attr.name.includes('message') ||
              attr.value.includes('message') ||
              attr.name.includes('author') ||
              attr.name.includes('role')
            );

            if (hasMessageAttr) {
              messageElements.push({
                tagName: el.tagName,
                attributes: attrs.map(a => a.name + '=' + a.value).slice(0, 5),
                textPreview: (el.textContent || '').slice(0, 80)
              });
            }
          }

          return {
            url: location.href,
            title: document.title,
            selectors: results,
            messageElementsSample: messageElements.slice(0, 10)
          };
        })()
      `
    }
  });

  console.log('[Debug] DOM Investigation Results:');
  console.log(JSON.stringify(JSON.parse(debugInfo.content[0].text), null, 2));

} catch (error) {
  console.error(`[Debug] Error: ${error.message}`);
}

await client.close();
console.log('\n[Debug] Done!');
process.exit(0);
