# Extension Bridge設計書

## 概要

chrome-ai-bridgeを**Extension Bridge専用**に変更し、ユーザーの既存Chromeブラウザのタブに接続する方式を実装しました。複数タブの同時管理（ChatGPT + Gemini同時操作など）をサポートします。

## 実装ステータス

- ✅ Phase 1: Extension実装（完了）
- ✅ Phase 2: MCPサーバー側対応（完了）
- ⏳ Phase 3: 既存コード削除（未実施）
- ⏳ Phase 4: E2Eテスト（未実施）

## 設計方針

### アーキテクチャ

**新しい方式:**
```
ユーザーが既にChromeを起動中
  ↓
chrome-ai-bridge起動（WebSocket Relayサーバーのみ）
  ↓
Chrome拡張機能がRelayに接続
  ↓
複数タブに同時接続（tabId指定）
  ↓
MCPツールでタブ操作
```

### 複数タブ管理

**同じMCPサーバーを複数インスタンス起動:**

```json
{
  "mcpServers": {
    "chrome-ai-bridge-chatgpt": {
      "command": "node",
      "args": ["--attachTab=101"]
    },
    "chrome-ai-bridge-gemini": {
      "command": "node",
      "args": ["--attachTab=102"]
    }
  }
}
```

## 実装内容

### Phase 1: Extension実装

**ファイル:**
- `src/extension/manifest.json` - Chrome拡張機能マニフェスト (MV3)
- `src/extension/background.mjs` - TabShareExtension + RelayConnection
- `src/extension/ui/connect.html` - タブ選択UI
- `src/extension/ui/connect.js` - UIロジック
- `src/extension/README.md` - 拡張機能ドキュメント

**主要クラス:**
- `TabShareExtension` - 複数WebSocket接続の管理
- `RelayConnection` - 単一タブへのchrome.debugger接続

### Phase 2: MCPサーバー側対応

**ファイル:**
- `src/extension/relay-server.ts` - WebSocketサーバー
- `src/extension/extension-transport.ts` - Puppeteer Transport実装
- `src/browser.ts` - connectViaExtension()追加
- `src/cli.ts` - --attachTab, --extensionRelayPort追加
- `src/main.ts` - 引数渡し対応
- `scripts/post-build.ts` - 拡張機能ファイルのビルド対応

**依存関係:**
- ws (WebSocketサーバー)
- @types/ws (型定義)

## 使い方

### 1. ビルド

```bash
npm run build
```

### 2. 拡張機能インストール

1. Chromeで `chrome://extensions/` を開く
2. デベロッパーモードを有効化
3. 「パッケージ化されていない拡張機能を読み込む」
4. `build/extension/` を選択

### 3. Claude Code設定

```json
{
  "mcpServers": {
    "chrome-ai-bridge-chatgpt": {
      "command": "node",
      "args": [
        "/path/to/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTab=101"
      ]
    }
  }
}
```

### 4. 接続

Claude Codeを起動すると、ログに接続URLが表示されます。そのURLを開いてタブを選択し、接続します。

## セキュリティ

- WebSocketサーバーは `127.0.0.1` (loopback) のみリッスン
- トークン認証による接続保護
- chrome.debugger APIによる安全なタブアクセス

## 次のステップ

1. Phase 3: 既存コード削除（browser.ts launch()等）
2. Phase 4: E2Eテスト（複数サブエージェント同時実行）
3. ドキュメント拡充
4. Chrome Web Store公開準備

詳細は `src/extension/README.md` を参照してください。
