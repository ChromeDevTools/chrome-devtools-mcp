#!/usr/bin/env node
/**
 * ChatGPT DOM構造調査（snapshotツール使用）
 */
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs'],
  env: { ...process.env }
});

const client = new Client({name: 'chatgpt-snapshot-test', version: '0.0.0'});

console.log('[Debug] Connecting...');
await client.connect(transport);
console.log('[Debug] Connected\n');

try {
  // ChatGPTタブのスナップショットを取得
  console.log('[Debug] Taking snapshot of ChatGPT page...\n');

  const snapshot = await client.callTool({
    name: 'take_snapshot',
    arguments: {}
  });

  const snapshotText = snapshot.content[0].text;

  // ファイルに保存
  await import('node:fs/promises').then(fs =>
    fs.writeFile('/tmp/chatgpt-snapshot.txt', snapshotText, 'utf-8')
  );

  console.log('[Debug] Snapshot saved to /tmp/chatgpt-snapshot.txt');
  console.log(`[Debug] Snapshot size: ${snapshotText.length} chars\n`);

  // メッセージ関連の要素を探す
  const lines = snapshotText.split('\n');
  const messageLines = lines.filter(line =>
    line.includes('message') ||
    line.includes('assistant') ||
    line.includes('user') ||
    line.includes('author') ||
    line.includes('role')
  );

  console.log('[Debug] Message-related elements found:');
  messageLines.slice(0, 30).forEach(line => console.log(line));

} catch (error) {
  console.error(`[Debug] Error: ${error.message}`);
  console.error(error.stack);
}

await client.close();
console.log('\n[Debug] Done!');
process.exit(0);
