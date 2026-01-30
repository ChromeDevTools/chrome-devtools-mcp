#!/usr/bin/env node
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    '/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs',
    '--attachTabUrl=https://gemini.google.com/',
    '--attachTabNew'
  ],
  env: { ...process.env }
});

const client = new Client({name: 'gemini-debug-test', version: '0.0.0'});

console.log('[Test] Connecting...');
await client.connect(transport);
console.log('[Test] Connected');

try {
  const result = await client.callTool({
    name: 'ask_gemini_web',
    arguments: {
      question: '日本の首都は？',
    },
  });
  console.log('[Test] Result:', JSON.stringify(result, null, 2));

  // コンソールログを取得
  console.log('\n[Test] Fetching console logs...');
  const logs = await client.callTool({
    name: 'list_console_messages',
    arguments: {},
  });
  console.log('[Test] Console logs:', logs);
} catch (error) {
  console.error('[Test] Error:', error.message);
}

await client.close();
