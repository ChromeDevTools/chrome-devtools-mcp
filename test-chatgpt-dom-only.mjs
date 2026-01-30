#!/usr/bin/env node
/**
 * ChatGPT DOM構造調査（応答待ちなし）
 */
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs'],
  env: { ...process.env }
});

const client = new Client({name: 'chatgpt-dom-only', version: '0.0.0'});

console.log('[Debug] Connecting...');
await client.connect(transport);
console.log('[Debug] Connected\n');

try {
  // 既存のChatGPTタブに接続するだけ（質問は送らない）
  console.log('[Debug] Checking ChatGPT page DOM structure...\n');

  const debugInfo = await client.callTool({
    name: 'evaluate_script',
    arguments: {
      function: `
        (() => {
          // 様々なセレクタを試す
          const selectors = {
            'user_messages_data_role': '[data-message-author-role="user"]',
            'assistant_messages_data_role': '[data-message-author-role="assistant"]',
            'agent_turn': '.agent-turn',
            'articles': 'article',
            'data_testid_user': '[data-testid*="user"]',
            'data_testid_assistant': '[data-testid*="assistant"]',
            'data_testid_conversation': '[data-testid*="conversation"]',
            'data_testid_message': '[data-testid*="message"]',
            'markdown': '.markdown',
            'prose': '.prose',
          };

          const results = {};

          for (const [key, sel] of Object.entries(selectors)) {
            try {
              const elements = document.querySelectorAll(sel);
              results[key] = {
                count: elements.length,
                samples: Array.from(elements).slice(0, 3).map(el => ({
                  tagName: el.tagName,
                  className: el.className || '(none)',
                  dataAttrs: Array.from(el.attributes || [])
                    .filter(attr => attr.name.startsWith('data-'))
                    .map(attr => attr.name + '="' + attr.value + '"'),
                  textPreview: (el.textContent || '').trim().slice(0, 60)
                }))
              };
            } catch (err) {
              results[key] = {error: err.message};
            }
          }

          // data-*属性を持つ全要素のサンプル
          const dataElements = Array.from(document.querySelectorAll('[data-message-author-role], [data-message-id], [data-testid]'))
            .slice(0, 10)
            .map(el => ({
              tagName: el.tagName,
              dataAttrs: Array.from(el.attributes || [])
                .filter(attr => attr.name.startsWith('data-'))
                .map(attr => attr.name + '="' + attr.value + '"'),
              textPreview: (el.textContent || '').trim().slice(0, 60)
            }));

          return {
            url: location.href,
            title: document.title,
            selectors: results,
            dataElementsSample: dataElements
          };
        })()
      `
    }
  });

  console.log('[Debug] DOM Investigation Results:');
  const parsed = JSON.parse(debugInfo.content[0].text);
  console.log(JSON.stringify(parsed, null, 2));

} catch (error) {
  console.error(`[Debug] Error: ${error.message}`);
  console.error(error.stack);
}

await client.close();
console.log('\n[Debug] Done!');
process.exit(0);
