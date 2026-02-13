// Minimal example: start the MCP server (stdio) and send an MCP "initialize" request.
//
// This is intentionally tiny and dependency-free so it works anywhere Node works.
//
// Usage:
//   node examples/minimal-node-client.mjs
//
// It will:
// 1) spawn `npx chrome-devtools-mcp@latest`
// 2) send the JSON-RPC initialize message
// 3) print the server's response

import { spawn } from 'node:child_process';

const child = spawn(
  'npx',
  ['--yes', 'chrome-devtools-mcp@latest'],
  {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Reduce noise in the example output.
      DEBUG: process.env.DEBUG ?? '',
      // Avoid telemetry prompts/noise in some environments.
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    },
  },
);

child.stderr.on('data', (d) => process.stderr.write(d));

let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString('utf8');
  // MCP stdio transport uses newline-delimited JSON.
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;

    try {
      const msg = JSON.parse(line);
      console.log('←', msg);
      // Exit after we receive initialize response.
      if (msg.id === 1) {
        child.kill();
        process.exit(0);
      }
    } catch {
      // ignore non-JSON lines
    }
  }
});

child.on('exit', (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
  }
});

const init = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'minimal-node-client', version: '0.0.0' },
  },
};

child.stdin.write(JSON.stringify(init) + '\n');
