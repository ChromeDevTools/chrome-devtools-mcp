# Extension2スタイルへの簡素化計画

## 📋 目標

playwright-mcp extension2 と同じシンプルなフローを実現する。

**フロー（SPEC.md参照）:**
1. Chromeは既に起動している
2. MCPサーバーが接続を開始すると、**自動的に** connect.html が開く
3. 現在開いている全タブの一覧が表示される
4. ユーザーが任意のタブを1つ選ぶ
5. 選んだタブがMCP操作対象になる

---

## 🔍 調査結果（2025-01-29）

### Extension2 の接続方式

**重要な発見:**
- Extension2 は **Puppeteer/Playwright 経由**で connect.html を開いている
- URLパラメータに `mcpRelayUrl`, `token`, `client`, `protocolVersion` を含める
- ポーリングは使っていない

**フロー:**
```
MCPサーバー
  ↓ Puppeteer/Playwright で Chrome を制御
  ↓ chrome.tabs.create() 相当の操作
connect.html?mcpRelayUrl=ws://127.0.0.1:PORT&token=xxx
  ↓ URLパラメータを解析
  ↓ WebSocket接続確立
Background Worker (RelayConnection)
```

### 問題点

`open -a "Google Chrome" "chrome-extension://..."` では chrome-extension:// URL が開けない。

---

## 🎯 代替案

### 案1: Discovery Polling（推奨）

拡張機能がMCPサーバーを定期的に探す。

**メリット:**
- 既存の Chrome をそのまま使える（--remote-debugging-port 不要）
- 実装がシンプル

**デメリット:**
- ポーリング間隔によっては反応が遅い
- Extension2 とは異なる方式

**実装:**
```javascript
// background.mjs
setInterval(async () => {
  const relayInfo = await fetchRelayInfo(); // HTTP GET /relay-info
  if (relayInfo?.wsUrl) {
    openConnectUI(relayInfo.wsUrl);
  }
}, 500); // 500ms間隔
```

### 案2: Puppeteer Connect

MCPサーバーが既存の Chrome に Puppeteer で接続してタブを開く。

**メリット:**
- Extension2 と同じ方式

**デメリット:**
- Chrome を `--remote-debugging-port=9222` で起動する必要がある
- 普段使いの Chrome では使えない

### 案3: Native Messaging

Chrome拡張機能の Native Messaging を使う。

**メリット:**
- プッシュ通知が可能

**デメリット:**
- セットアップが複雑（ホストアプリのインストールが必要）

---

## 🔬 調査結論（2025-01-29 追加）

### Extension2/Playwright MCP の `--extension` フラグの実装を解明！

**Playwright 本体のソースコード発見:**
`/tmp/pw-check/node_modules/playwright/lib/mcp/extension/cdpRelay.js`

**核心コード:**
```javascript
_connectBrowser(clientInfo, toolName) {
  const url = new URL("chrome-extension://jakfalbnbhgkpmoaakfflhflbfpkailf/connect.html");
  url.searchParams.set("mcpRelayUrl", mcpRelayEndpoint);
  // ...

  const args = [];
  if (this._userDataDir)
    args.push(`--user-data-dir=${this._userDataDir}`);
  args.push(href);  // connect.html の URL

  // Chrome を spawn で起動！
  spawn(executablePath, args, { detached: true, ... });
}
```

**重要な発見:**
1. **「既存のブラウザに接続」ではなく「新しい Chrome プロセスを spawn」**
2. connect.html の URL を**コマンドライン引数**として渡す
3. `--user-data-dir` で同じプロファイルを使う → ログイン状態を共有
4. 拡張機能ID `jakfalbnbhgkpmoaakfflhflbfpkailf` がハードコード

**フロー:**
```
1. MCP サーバーが WebSocket リレーを起動
2. Chrome を spawn (connect.html?mcpRelayUrl=... を引数で)
3. Chrome が起動し、connect.html が開く
4. 拡張機能が WebSocket でリレーに接続
5. ユーザーがタブを選択
6. Playwright が connectOverCDP でリレー経由で操作
```

---

## ✅ 推奨方針（更新）

**Extension2 と同じ方式: Chrome を spawn して connect.html を開く**

```javascript
const { spawn } = require('child_process');

const connectUrl = `chrome-extension://${EXTENSION_ID}/ui/connect.html?mcpRelayUrl=${wsUrl}`;
spawn('open', ['-a', 'Google Chrome', connectUrl], { detached: true });
```

**注意点:**
- `open -a "Google Chrome" "chrome-extension://..."` は動作しない可能性（先の実験で失敗）
- 代替: Chrome の実行ファイルを直接 spawn

```javascript
// macOS
spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [connectUrl], { detached: true });
```

**フロー:**
```
1. MCP サーバーが WebSocket リレーを起動
2. Chrome を spawn (connect.html?mcpRelayUrl=... を引数で)
3. Chrome が新しいタブで connect.html を開く
4. 拡張機能が WebSocket でリレーに接続
5. ユーザーがタブを選択
6. 接続完了
```

**既存 Chrome が開いている場合:**
- `--user-data-dir` を指定しなければ、既存の Chrome で新しいタブとして開く
- または既存の Chrome がロックしている場合はエラー

**フォールバック:**
- Chrome spawn が失敗したら Discovery Polling にフォールバック

---

## 📁 変更ファイル一覧（最終版）

| ファイル | 変更内容 |
|---------|---------|
| `src/fast-cdp/extension-raw.ts` | Chrome を spawn して connect.html を開く |
| `src/extension/ui/connect.js` | URL パラメータから mcpRelayUrl を取得（既存） |
| `src/extension/manifest.json` | key を追加（固定ID）、バージョンを上げる |
| `src/extension/background.mjs` | Discovery polling をフォールバックとして維持 |

---

## 🧪 検証方法

1. `npm run build`
2. chrome://extensions/ で拡張機能を更新（バージョン確認）
3. Claude Code 再起動
4. `ask_gemini_web` を実行
5. **自動的に connect.html が開く**
6. タブを選択して Connect
7. Gemini に質問が送信される

---

## 🎨 デザイン改善（extension2より良くする）

### タブ一覧のデザイン

**extension2の問題点:**
- シンプルすぎて情報が少ない
- タブIDが見えない

**改善点:**
1. **favicon表示**: 各タブのfaviconを表示
2. **タブID表示**: デバッグ用にタブIDを小さく表示
3. **アクティブタブのハイライト**: 現在アクティブなタブを強調
4. **ホバー効果**: より分かりやすいインタラクション
5. **Connectボタンをタブ行内に**: extension2と同じ配置

### UIコンポーネント

```
┌─────────────────────────────────────────────────────┐
│ 🎭 chrome-ai-bridge - Select Tab                    │
├─────────────────────────────────────────────────────┤
│ Select page to expose to MCP server:                │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🌐 ChatGPT                          [Connect]   │ │
│ │    https://chatgpt.com/                         │ │
│ │    Tab ID: 123                                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🔷 Gemini                           [Connect]   │ │
│ │    https://gemini.google.com/                   │ │
│ │    Tab ID: 456                                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 Example Page                      [Connect]   │ │
│ │    https://example.com/                         │ │
│ │    Tab ID: 789 ⭐ Active                        │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### カラースキーム

- **背景**: `#ffffff` (ライト) / `#0d1117` (ダーク)
- **タブアイテム**: `#f6f8fa` hover時
- **Connectボタン**: GitHub Primerスタイル（グレー背景、ホバーで強調）
- **アクティブタブ**: ⭐マーク + 背景色変更

---

## 🔧 変更内容

### 1. Discovery機能の削除

**削除対象:**
- `src/extension/relay-server.ts`: `startDiscoveryServer()` 関連
- `src/extension/background.mjs`: `autoOpenConnectUi()`, `scheduleDiscovery()`, アラーム関連
- `src/extension/ui/connect.js`: `detectRelayInfo()`, `tryAutoDetectRelay()` 関連

### 2. MCPサーバー側の変更

**`src/browser.ts`:**
- RelayServer起動後、Chromeで `connect.html?mcpRelayUrl={wsUrl}` を開く
- extension2と同じパターン

### 3. 拡張機能UIの簡素化

**`src/extension/ui/connect.html` & `connect.js`:**
- Relay URL入力フォームを削除（URLパラメータから取得するため）
- タブ一覧 → 選択 → Connect のシンプルなフロー
- extension2のUIに近づける

### 4. background.mjsの簡素化

**削除:**
- `DISCOVERY_ALARM`, `DISCOVERY_PORTS`, `lastRelayByPort`
- `autoOpenConnectUi()`, `autoConnectRelay()`, `fetchRelayInfo()`
- `scheduleDiscovery()`, アラーム関連リスナー

**保持:**
- `RelayConnection` クラス（CDPパススルー）
- `TabShareExtension` クラス（タブ管理）
- メッセージハンドラ (`connectToRelay`, `connectToTab`, `disconnect`)

---

## 📁 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/extension/background.mjs` | Discovery関連を削除、シンプル化 |
| `src/extension/relay-server.ts` | `startDiscoveryServer()` 削除 |
| `src/extension/ui/connect.html` | Relay URL入力フォーム削除 |
| `src/extension/ui/connect.js` | 自動検出ロジック削除、シンプル化 |
| `src/browser.ts` | connect.htmlを自動で開くロジック追加 |

---

## 🧪 検証方法

### 変更後の手順

1. **ビルド**
   ```bash
   npm run build
   ```

2. **拡張機能をリロード**
   - `chrome://extensions/` を開く
   - chrome-ai-bridgeの「更新」ボタンをクリック
   - または拡張機能を一度無効化 → 有効化

3. **Claude Codeを再起動**
   - `Cmd+Shift+P` → "Reload Window"

4. **動作確認**
   - `ask_chatgpt_gemini_web` を実行
   - connect.htmlが自動で開く（URLパラメータ付き）
   - タブ一覧からChatGPTタブを選択
   - 「Connect」ボタンをクリック
   - 接続完了

### 変更が必要なタイミング

| 変更対象 | 必要なアクション |
|---------|----------------|
| `src/extension/**` | `npm run build` + 拡張機能リロード |
| `src/*.ts` (MCP側) | `npm run build` + Claude Code再起動 |
| 両方 | 全部やる |
