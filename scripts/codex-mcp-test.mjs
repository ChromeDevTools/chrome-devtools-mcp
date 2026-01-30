#!/usr/bin/env node
/**
 * @deprecated This script is no longer maintained.
 * Use instead:
 *   - npm run test:chatgpt -- "質問"
 *   - npm run test:gemini -- "質問"
 *   - npm run cdp:chatgpt
 */
console.error('');
console.error('⚠️  DEPRECATED: このスクリプトは非推奨です。');
console.error('   現在は以下を使用してください:');
console.error('   - npm run test:chatgpt -- "質問"');
console.error('   - npm run test:gemini -- "質問"');
console.error('   - npm run cdp:chatgpt');
console.error('');
process.exit(1);

// Original code below (kept for reference, but never executed)
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    '/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs',
    '--attachTabUrl=https://chatgpt.com/',
    '--attachTabNew'
  ],
  env: { ...process.env, DEBUG: 'mcp:log' }
});

const client = new Client({name: 'codex-test', version: '0.0.0'});
console.log('CONNECT...');
await client.connect(transport);
console.log('CONNECTED');

const targetArg = process.argv[2];
const target = (targetArg || process.env.TEST_TARGET || 'both').toLowerCase();
const tasks = [];

const nonce = new Date().toISOString();
const a = Math.floor(Math.random() * 90) + 10;
const b = Math.floor(Math.random() * 90) + 10;
const op = Math.random() < 0.7 ? '+' : '*';
const expected = op === '+' ? a + b : a * b;
const question = `ちょっと計算を手伝ってください。${a} ${op} ${b} はいくつですか？数字だけで答えてください。（${nonce}）`;

const extractNumber = (value) => {
  if (!value) return null;
  const match = String(value).match(/-?\\d+(?:\\.\\d+)?/);
  return match ? Number(match[0]) : null;
};

if (target === 'both' || target === 'chatgpt') {
  tasks.push(
    (async () => {
      console.log('CALL ask_chatgpt_web');
      const result = await client.callTool({
        name: 'ask_chatgpt_web',
        arguments: {
          question,
        },
      });
      console.log('CHATGPT', JSON.stringify(result).slice(0, 2000));
      const text = result?.content?.[0]?.text || '';
      const got = extractNumber(text);
      if (got !== expected) {
        console.error(`CHATGPT MISMATCH: expected=${expected} got=${got}`);
      } else {
        console.log('CHATGPT OK: matched');
      }
    })(),
  );
}

if (target === 'both' || target === 'gemini') {
  tasks.push(
    (async () => {
      console.log('CALL ask_gemini_web');
      const resultGemini = await client.callTool({
        name: 'ask_gemini_web',
        arguments: {
          question,
        },
      });
      console.log('GEMINI', JSON.stringify(resultGemini).slice(0, 2000));
      const text = resultGemini?.content?.[0]?.text || '';
      const got = extractNumber(text);
      if (got !== expected) {
        console.error(`GEMINI MISMATCH: expected=${expected} got=${got}`);
      } else {
        console.log('GEMINI OK: matched');
      }
    })(),
  );
}

await Promise.all(tasks);

await client.close();
console.log('DONE');
