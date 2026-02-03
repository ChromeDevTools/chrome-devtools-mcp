#!/usr/bin/env node
/**
 * Extension自動リロードスクリプト
 *
 * ビルド後にChrome拡張機能を自動でリロードする。
 * RelayServerのDiscovery Serverに HTTP POST で reloadExtension を送信。
 *
 * 使い方:
 *   node scripts/reload-extension.mjs
 *
 * npm scriptとして:
 *   npm run reload-ext
 *   npm run build  # ビルド後に自動実行
 */

import fs from 'node:fs';

const RELAY_INFO_PATH = '/tmp/chrome-ai-bridge-relay.json';
const TIMEOUT_MS = 5000;

async function main() {
  // Check if relay info file exists
  if (!fs.existsSync(RELAY_INFO_PATH)) {
    console.log('[reload-ext] No relay info file (skipping)');
    process.exit(0);
  }

  let relayInfo;
  try {
    relayInfo = JSON.parse(fs.readFileSync(RELAY_INFO_PATH, 'utf8'));
  } catch (err) {
    console.log('[reload-ext] Failed to read relay info (skipping)');
    process.exit(0);
  }

  // Check if relay info is stale (older than 1 hour)
  const age = Date.now() - (relayInfo.timestamp || 0);
  if (age > 60 * 60 * 1000) {
    console.log('[reload-ext] Relay info is stale (skipping)');
    fs.unlinkSync(RELAY_INFO_PATH);
    process.exit(0);
  }

  const discoveryPort = relayInfo.discoveryPort;
  if (!discoveryPort) {
    console.log('[reload-ext] Invalid relay info (skipping)');
    process.exit(0);
  }

  const url = `http://127.0.0.1:${discoveryPort}/reload-extension`;
  console.log(`[reload-ext] Sending reload request to ${url}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        console.log('[reload-ext] Extension reloaded successfully');
      } else {
        console.log(`[reload-ext] Unexpected response: ${JSON.stringify(result)}`);
      }
    } else {
      const text = await response.text();
      console.log(`[reload-ext] Failed: ${response.status} ${text}`);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[reload-ext] Request timeout (skipping)');
    } else if (err.code === 'ECONNREFUSED') {
      console.log('[reload-ext] No active MCP server (skipping)');
      fs.unlinkSync(RELAY_INFO_PATH);
    } else {
      console.log(`[reload-ext] Request failed: ${err.message}`);
    }
  }
}

main();
