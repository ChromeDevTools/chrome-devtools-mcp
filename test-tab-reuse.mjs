#!/usr/bin/env node
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    '/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs'
  ],
  env: { ...process.env }
});

const client = new Client({name: 'tab-reuse-test', version: '0.0.0'});

console.log('[Test] Connecting...');
await client.connect(transport);
console.log('[Test] Connected\n');

console.log('=== Test 1: First question (should create new tab) ===');
await client.callTool({
  name: 'ask_gemini_web',
  arguments: {
    question: '1+1は？',
  },
});
console.log('[Test] First question done\n');

console.log('Waiting 3 seconds...\n');
await new Promise(resolve => setTimeout(resolve, 3000));

console.log('=== Test 2: Second question (should reuse existing tab) ===');
await client.callTool({
  name: 'ask_gemini_web',
  arguments: {
    question: '2+2は？',
  },
});
console.log('[Test] Second question done\n');

await client.close();
console.log('[Test] Done! Check if the same tab was reused.');
