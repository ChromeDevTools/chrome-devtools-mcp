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
/**
 * Start MCP servers defined in .mcp.json without relying on MCP client discovery.
 * Usage: node scripts/start-mcp-from-json.mjs [path/to/.mcp.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const argv = process.argv.slice(2);
const jsonPath = argv[0]
  ? path.resolve(process.cwd(), argv[0])
  : path.resolve(process.cwd(), '.mcp.json');

if (!fs.existsSync(jsonPath)) {
  console.error(`[start-mcp] .mcp.json not found: ${jsonPath}`);
  process.exit(1);
}

let config;
try {
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  config = JSON.parse(raw);
} catch (error) {
  console.error(`[start-mcp] Failed to read/parse ${jsonPath}: ${error.message}`);
  process.exit(1);
}

const servers = config?.mcpServers;
if (!servers || typeof servers !== 'object') {
  console.error('[start-mcp] No mcpServers found in .mcp.json');
  process.exit(1);
}

const entries = Object.entries(servers);
if (entries.length === 0) {
  console.error('[start-mcp] mcpServers is empty');
  process.exit(1);
}

const children = new Map();

function prefixStream(name, stream) {
  let buffer = '';
  stream.on('data', chunk => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx + 1);
      buffer = buffer.slice(idx + 1);
      process.stdout.write(`[${name}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (buffer) process.stdout.write(`[${name}] ${buffer}\n`);
  });
}

function startServer(name, spec) {
  if (!spec?.command) {
    console.error(`[start-mcp] ${name}: missing command`);
    return;
  }
  const args = Array.isArray(spec.args) ? spec.args : [];
  const env = {...process.env, ...(spec.env || {})};
  const cwd = spec.cwd ? path.resolve(process.cwd(), spec.cwd) : process.cwd();

  console.error(`[start-mcp] Starting ${name}: ${spec.command} ${args.join(' ')}`);
  const child = spawn(spec.command, args, {
    cwd,
    env,
    // Keep stdin open so stdio-based MCP servers don't exit immediately.
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  prefixStream(name, child.stdout);
  prefixStream(name, child.stderr);

  // Do not close stdin; keep it open to prevent EOF-triggered shutdown.
  // Avoid piping process.stdin to prevent accidental input injection.

  child.on('exit', (code, signal) => {
    console.error(`[start-mcp] ${name} exited (code=${code}, signal=${signal})`);
    children.delete(name);
  });

  children.set(name, child);
}

const basePort = Number(process.env.MCP_HTTP_PORT_BASE || '8765');
let index = 0;
for (const [name, spec] of entries) {
  const specEnv = spec?.env || {};
  if (!specEnv.MCP_HTTP_PORT && Number.isFinite(basePort)) {
    spec.env = {...specEnv, MCP_HTTP_PORT: String(basePort + index)};
  }
  if (!specEnv.MCP_HTTP_HOST) {
    spec.env = {...(spec.env || {}), MCP_HTTP_HOST: '127.0.0.1'};
  }
  startServer(name, spec);
  index += 1;
}

// Best-effort: update Codex CLI MCP config to point at the local HTTP endpoints.
if (process.env.MCP_HTTP_PORT_BASE !== '0') {
  try {
    const {spawnSync} = await import('node:child_process');
    const configurePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'configure-codex-mcp.mjs',
    );
    spawnSync(process.execPath, [configurePath, '--http', String(basePort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
  } catch {
    // Ignore config write errors; HTTP endpoints still work if configured manually.
  }
}

function shutdown() {
  for (const [name, child] of children.entries()) {
    console.error(`[start-mcp] Stopping ${name}`);
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
