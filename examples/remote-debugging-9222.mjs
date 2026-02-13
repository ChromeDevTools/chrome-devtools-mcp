// Example: connect to a Chrome instance that was started with a remote debugging port.
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
// This spawns the MCP server and connects it to http://127.0.0.1:9222 via --browserUrl.
//
// Note: This is intentionally a small template you can adapt for your own MCP client.

import { spawn } from 'node:child_process';

const DEBUG_URL = process.env.CHROME_DEBUG_URL ?? 'http://127.0.0.1:9222';

const child = spawn(
  'npx',
  ['--yes', 'chrome-devtools-mcp@latest', '--browserUrl', DEBUG_URL],
  {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    },
  },
);

child.stderr.on('data', (d) => process.stderr.write(d));

let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      console.log('←', msg);
      // Exit after initialize.
      if (msg.id === 1) {
        child.kill();
        process.exit(0);
      }
    } catch {
      // ignore non-JSON lines
    }
  }
});

const init = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'remote-debugging-9222', version: '0.0.0' },
  },
};

child.stdin.write(JSON.stringify(init) + '\n');
