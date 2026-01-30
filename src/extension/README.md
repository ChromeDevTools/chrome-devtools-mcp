# chrome-ai-bridge Extension

このChrome拡張機能は、chrome-ai-bridge MCPサーバーとChromeブラウザのタブを接続します。

## アーキテクチャ

```
chrome-ai-bridge MCPサーバー (プロセス1)
  ↓ WebSocket
Extension (TabShareExtension)
  ↓ chrome.debugger API
Chrome Tab #101 (ChatGPT)

chrome-ai-bridge MCPサーバー (プロセス2)
  ↓ WebSocket
Extension (TabShareExtension)
  ↓ chrome.debugger API
Chrome Tab #102 (Gemini)
```

## インストール

### 1. ビルド

```bash
cd /path/to/chrome-ai-bridge
npm run build
```

### 2. 拡張機能をChromeにロード

1. Chromeを開く
2. `chrome://extensions/` にアクセス
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `src/extension/` ディレクトリを選択

### 3. 拡張機能IDを確認

インストール後、拡張機能のIDをメモしてください（例: `abcdefghijklmnopqrstuvwxyz`）。

## 使い方

### Claude Code設定

`~/.config/claude-code/config.json`に以下のように設定:

```json
{
  "mcpServers": {
    "chrome-ai-bridge-chatgpt": {
      "command": "node",
      "args": [
        "/path/to/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTab=101"
      ]
    },
    "chrome-ai-bridge-gemini": {
      "command": "node",
      "args": [
        "/path/to/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTab=102"
      ]
    }
  }
}
```

### MCPサーバー起動

1. Claude Codeを起動
2. MCPサーバーが自動的に起動し、WebSocket Relayサーバーが立ち上がります
3. ログに以下のようなメッセージが表示されます:

```
[Extension Bridge] RelayServer started on port 12345
[Extension Bridge] Connection URL: ws://127.0.0.1:12345?token=...
```

### 拡張機能UI を開く

1. 拡張機能のアイコンをクリック、または直接URLを開く:

```
chrome-extension://[EXTENSION_ID]/ui/connect.html?mcpRelayUrl=ws://127.0.0.1:12345&tabId=101
```

2. タブ選択UIで接続したいタブを選択
3. 「Connect to Selected Tab」をクリック

### URL指定で自動接続（推奨）

`--attachTabUrl` を使うと、拡張機能が URL に一致するタブを自動接続します。
一致タブがない場合に新規タブを開きたい場合は `--attachTabNew` を追加します。

例:

```json
{
  "mcpServers": {
    "chrome-ai-bridge-chatgpt": {
      "command": "node",
      "args": [
        "/path/to/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTabUrl=https://chatgpt.com/",
        "--attachTabNew"
      ]
    }
  }
}
```

### 接続確認

MCPサーバーのログに以下のメッセージが表示されれば成功:

```
[Extension Bridge] Extension connected to tab 101
[Extension Bridge] Puppeteer connected to Extension
```

## ファイル構成

```
src/extension/
├── manifest.json          # 拡張機能マニフェスト
├── background.mjs         # Service Worker (TabShareExtension, RelayConnection)
├── ui/
│   ├── connect.html       # タブ選択UI
│   └── connect.js         # UIロジック
├── relay-server.ts        # WebSocketサーバー (MCPサーバー側)
└── extension-transport.ts # Puppeteer Transport実装 (MCPサーバー側)
```

## トラブルシューティング

### Extension connection timeout

**原因**: 拡張機能がインストールされていないか、UIが開かれていない

**解決策**:
1. 拡張機能が正しくインストールされているか確認
2. connect.htmlを開いてタブを選択

### Invalid token

**原因**: MCPサーバーのトークンが一致しない

**解決策**:
1. MCPサーバーのログからトークンを確認
2. URLパラメータに正しいトークンを含める

### Tab not found

**原因**: 指定したタブIDが存在しない

**解決策**:
1. `chrome://inspect/#pages` でタブIDを確認
2. 正しいタブIDを指定

## セキュリティ

- WebSocketサーバーは `127.0.0.1` (loopback) のみリッスン
- トークン認証による接続保護
- chrome.debugger APIによる安全なタブアクセス

## 開発

### デバッグモード

Service Workerのコンソールでデバッグログを確認:

1. `chrome://extensions/` を開く
2. chrome-ai-bridge拡張機能の「Service Workerを検証」をクリック
3. DevToolsコンソールでログを確認

### 変更の反映

1. コードを変更
2. `npm run build` 実行
3. `chrome://extensions/` で拡張機能の「更新」ボタンをクリック
