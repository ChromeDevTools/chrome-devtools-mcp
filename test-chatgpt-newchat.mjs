#!/usr/bin/env node
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs'],
  env: { ...process.env }
});

const client = new Client({name: 'chatgpt-newchat-test', version: '0.0.0'});

console.log('[Test] Connecting...');
await client.connect(transport);
console.log('[Test] Connected\n');

console.log('=== New Chat Test ===');
console.log('[Test] Question: 1+1は？');

try {
  const startTime = Date.now();
  const result = await client.callTool({
    name: 'ask_chatgpt_web',
    arguments: {
      question: '1+1は？',
      createNewChat: true  // 新規チャットで試す
    },
  });

  const elapsed = Date.now() - startTime;
  const text = result?.content?.[0]?.text || '';

  console.log(`[Test] ✅ Success in ${elapsed}ms`);
  console.log(`[Test] Response: ${text.slice(0, 200)}...\n`);
} catch (error) {
  console.error(`[Test] ❌ Failed: ${error.message}\n`);
  process.exit(1);
}

await client.close();
console.log('[Test] Done!');
process.exit(0);
