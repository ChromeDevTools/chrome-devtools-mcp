#!/usr/bin/env node
/**
 * Extension自動リロードスクリプト
 *
 * ビルド後にChrome拡張機能を自動でリロードする。
 * MCP Serverの既存接続を使用してreloadExtensionコマンドを送信。
 *
 * 使い方:
 *   node scripts/reload-extension.mjs
 *
 * npm scriptとして:
 *   npm run reload-ext
 *   npm run build  # ビルド後に自動実行
 */

import { getExistingRelay } from '../build/src/fast-cdp/fast-chat.js';

async function main() {
  // 既存の接続を確認（chatgpt または gemini）
  const relay = getExistingRelay('chatgpt') || getExistingRelay('gemini');

  if (!relay) {
    console.log('[reload-ext] No active connection (skipping)');
    process.exit(0);
  }

  try {
    const result = await relay.sendRequest('reloadExtension');
    console.log('[reload-ext] Extension reloaded:', result?.message || 'success');
  } catch (err) {
    // 接続が切れるのは正常（Extensionがリロードされた）
    console.log('[reload-ext] Extension reload initiated');
  }
}

main();
