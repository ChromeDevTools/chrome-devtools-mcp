# Extension 自動リロード機能（実装済み）

## 概要

`npm run build` 実行時に Extension を自動リロードする機能。

## 実装方式

```
MCP Server 接続時:
  extension-raw.ts → /tmp/chrome-ai-bridge-relay.json に wsUrl 保存

npm run build 時:
  reload-extension.mjs → ファイル読み込み → WebSocket 接続 → reloadExtension 送信
```

## 修正ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/fast-cdp/extension-raw.ts` | relay 起動後に接続情報をファイル保存 |
| `scripts/reload-extension.mjs` | ファイルを読み WebSocket で直接接続 |
| `src/fast-cdp/fast-chat.ts` | 不要な `getExistingRelay` を削除 |

## 検証方法

1. MCP 再接続済み（`/mcp` で Reconnected）
2. `npm run build` 実行
3. 出力に `[reload-ext] Connecting to ws://...` が表示される
4. `[reload-ext] Extension reloaded successfully` で成功
5. `chrome://extensions/` でバージョンが 2.0.17 に更新されていることを確認
