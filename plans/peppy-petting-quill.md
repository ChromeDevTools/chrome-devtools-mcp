# 拡張機能修正プラン（v1.1.21）

## 🔴 緊急修正: Discovery機構が動作しない

### 問題の症状
- MCPサーバーからの接続リクエストが10秒でタイムアウト
- 拡張機能は「passive mode - no auto-discovery」で起動
- `scheduleDiscovery()` がどこからも呼ばれていない

### 根本原因
```
MCPサーバー: Discovery HTTPサーバーを起動 (8765-8775)
       ↓
       待機...（Extensionが接続してくるのを待つ）
       ↓
Extension: passive mode。ポーリングなし。誰も呼んでない。
       ↓
MCPサーバー: 10秒後タイムアウト
```

以前（コミット 3e11086）は `startDiscoveryPolling()` が常時ポーリングしていたが、
自動タブオープン問題修正時に削除され、代替のトリガー機構がない。

---

## 修正対象

### 1. Discovery機構の復活（🔴 緊急）
- **現在の状態**: `scheduleDiscovery()` は存在するが呼ばれない
- **修正方針**: Extension起動時にポーリングを開始

### 2. タブID選択の厳密化（✅ v1.1.20で実装済み）
- tabId保存機能は実装完了
- Discovery問題が解決すれば動作確認可能

---

## 修正プラン

### Phase 1: Discovery ポーリングの復活

**ファイル**: `src/extension/background.mjs`

**変更内容**: Extension起動時に `scheduleDiscovery()` を呼び出す

現在コメントアウトされている以下を復活:
```javascript
// 行 715-718
chrome.runtime.onInstalled.addListener(() => { scheduleDiscovery(); });
chrome.runtime.onStartup.addListener(() => { scheduleDiscovery(); });
scheduleDiscovery();  // 即座に開始
```

**自動タブオープン問題への対策**:
- `autoConnectRelay()` は `tabUrl` がある場合のみタブを作成
- `tabUrl` がない relay-info は無視される
- 既存の実装で問題なし

### Phase 2: ログ強化（デバッグ用）

**変更内容**: Discovery ループの状態をログに出力

```javascript
function scheduleDiscovery() {
  logInfo('discovery', 'scheduleDiscovery called');  // 追加
  autoOpenConnectUi();
  // ...
}
```

### Phase 3: バージョン更新

**ファイル**: `src/extension/manifest.json`
- バージョン: 1.1.20 → 1.1.21

---

## 修正ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/extension/background.mjs` | scheduleDiscovery()呼び出し復活、ログ追加 |
| `src/extension/manifest.json` | バージョン: 1.1.20 → 1.1.21 |

---

## テスト手順

### Step 1: ビルド & 拡張機能更新
```bash
npm run build
# chrome://extensions/ で更新、v1.1.21を確認
```

### Step 2: Service Worker ログ確認
1. chrome://extensions/ → Service Worker クリック
2. コンソールに以下が表示されることを確認:
   - `scheduleDiscovery called`
   - `Extension loaded` (passive mode ではなくなる)

### Step 3: ChatGPT 接続テスト
```bash
node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs chatgpt "TypeScriptの型ガードの書き方を1行で説明して"
```

### Step 4: Gemini 接続テスト
```bash
node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs gemini "JavaScriptのPromiseを1行で説明して"
```

### Step 5: 自動タブオープン問題の非発生確認
- テスト後、数分放置
- ChatGPT/Geminiタブが自動で開かないことを確認

---

## 検証チェックリスト

- [ ] `npm run build` 成功
- [ ] 拡張機能バージョン 1.1.21
- [ ] Service Worker ログに `scheduleDiscovery called` 表示
- [ ] ChatGPT 接続テスト成功
- [ ] Gemini 接続テスト成功
- [ ] 数分後も自動タブオープンなし

---

## トラブルシューティング

### 接続タイムアウト
```
Error: Extension connection timeout (5s)
```

**対処**:
1. Service Worker ログを確認
2. `New relay detected` が出ているか確認
3. 出ていなければポーリングが動いていない

### ポート競合
```bash
lsof -i :8765-8775 | grep LISTEN
kill -9 <PID>
```
