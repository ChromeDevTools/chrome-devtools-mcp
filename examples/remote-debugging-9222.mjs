// Example: connect to a Chrome instance that was started with a remote debugging port,
// using the official MCP TypeScript SDK.
//
// 1) Start Chrome manually with remote debugging enabled, e.g.:
//    macOS:
//      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
//    Linux:
//      google-chrome --remote-debugging-port=9222
//
// 2) Run this script:
//      node examples/remote-debugging-9222.mjs
//
// This starts chrome-devtools-mcp with --browserUrl and connects through MCP stdio.
//
// For SDK details, see:
// https://modelcontextprotocol.io/docs/develop/build-client#typescript

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const DEBUG_URL = process.env.CHROME_DEBUG_URL ?? 'http://127.0.0.1:9222';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['--yes', 'chrome-devtools-mcp@latest', '--browserUrl', DEBUG_URL],
  env: {
    ...process.env,
    CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
  },
  stderr: 'inherit',
});

const client = new Client(
  { name: 'remote-debugging-9222', version: '0.0.0' },
  { capabilities: {} },
);

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`Connected to ${DEBUG_URL}. Found ${tools.length} tools.`);

  for (const tool of tools.slice(0, 10)) {
    console.log(`- ${tool.name}`);
  }
} finally {
  await transport.close();
}
