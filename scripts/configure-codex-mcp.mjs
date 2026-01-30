#!/usr/bin/env node
/**
 * Configure Codex CLI MCP servers.
 * Usage:
 *   node scripts/configure-codex-mcp.mjs            # stdio (recommended)
 *   node scripts/configure-codex-mcp.mjs --http 8765
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const useHttp = argv.includes('--http');
const basePort = Number(
  argv.find(arg => /^[0-9]+$/.test(arg)) ||
    process.env.MCP_HTTP_PORT_BASE ||
    '8765',
);
if (useHttp && (!Number.isFinite(basePort) || basePort <= 0)) {
  console.error(`[codex-config] Invalid base port: ${argv[0] || ''}`);
  process.exit(1);
}

const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const configPath = path.join(codexHome, 'config.toml');

function loadConfig() {
  if (!fs.existsSync(configPath)) return '';
  return fs.readFileSync(configPath, 'utf-8');
}

function stripServerBlocks(toml, serverNames) {
  let output = toml;
  for (const name of serverNames) {
    const pattern = new RegExp(
      String.raw`\n?\[mcp_servers\.${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\][\s\S]*?(?=\n\[|\n?$)`,
      'g',
    );
    output = output.replace(pattern, '\n');
  }
  return output.trimEnd() + '\n';
}

function ensureMcpSection(toml) {
  return toml.endsWith('\n') ? toml : toml + '\n';
}

const serverNames = ['chrome-ai-bridge-chatgpt', 'chrome-ai-bridge-gemini'];
let toml = loadConfig();
const cleaned = stripServerBlocks(toml, serverNames);
let updated = ensureMcpSection(cleaned);

const nodePath = process.execPath;
const entries = serverNames.map((name, idx) => {
  if (useHttp) {
    const port = basePort + idx;
    return `\n[mcp_servers.${name}]\nurl = "http://127.0.0.1:${port}/mcp"\n`;
  }
  const url =
    name === 'chrome-ai-bridge-chatgpt'
      ? 'https://chatgpt.com/'
      : 'https://gemini.google.com/app';
  const logFile =
    name === 'chrome-ai-bridge-chatgpt'
      ? '/tmp/chrome-ai-bridge-codex-chatgpt.log'
      : '/tmp/chrome-ai-bridge-codex-gemini.log';
  return `\n[mcp_servers.${name}]\ncommand = "${nodePath}"\nargs = [\n  "${path.join(
    process.cwd(),
    'scripts',
    'cli.mjs',
  )}",\n  "--attachTabUrl=${url}",\n  "--attachTabNew",\n  "--logFile=${logFile}"\n]\n`;
});

updated += entries.join('');

fs.mkdirSync(codexHome, {recursive: true});
fs.writeFileSync(configPath, updated, 'utf-8');
console.error(
  `[codex-config] Wrote ${configPath} (${useHttp ? 'http' : 'stdio'})`,
);
