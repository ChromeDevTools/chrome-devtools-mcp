# Extension Bridge - 接続問題の状況まとめ

**作成日時**: 2026-01-28 16:40
**担当**: Claude 4.5
**環境**: tmuxシェル（VSCodeではない）

---

## 📋 現在の状況：やりたいこと vs 実際の状況

| # | やりたいこと | 実際の状況 | 問題 |
|---|-------------|-----------|------|
| 1 | Extension Bridge経由でChatGPT/Geminiタブに接続したい | プロセスは`--attachTabUrl`で起動しているが、別のプロファイルでChromeが起動している | Extension Bridgeモードなのに通常ブラウザ起動にフォールバック |
| 2 | `take_snapshot`でDOM取得したい | "Protocol error (Target.closed): Target closed"エラー | Extension接続が確立していない |
| 3 | 既存のChromeタブを操作したい | 専用プロファイル（`~/.cache/chrome-ai-bridge/profiles/`）で新しいChromeが起動 | ユーザーの既存Chromeと分離されている |

---

## ✅ 正常に動作している部分

### 1. MCPサーバーの起動

```bash
# プロセス確認
$ ps aux | grep "attachTabUrl" | grep -v grep

usedhonda  6750  node --import ... /build/src/main.js --attachTabUrl=https://chatgpt.com/ --attachTabNew
usedhonda  6748  node --import ... /build/src/main.js --attachTabUrl=https://gemini.google.com/app --attachTabNew
```

**確認事項**:
- ✅ `.mcp.json`は正しく読み込まれている
- ✅ `chrome-ai-bridge-chatgpt`, `chrome-ai-bridge-gemini`の2プロセスが起動
- ✅ `--attachTabUrl`フラグが正しく渡されている
- ✅ `/mcp`コマンドで2つのMCPサーバーが認識されている

### 2. MCPツールの登録

```bash
# ToolSearchでツール確認成功
mcp__chrome-ai-bridge__take_snapshot
mcp__chrome-ai-bridge__click
mcp__chrome-ai-bridge__fill
# ... 他多数
```

**確認事項**:
- ✅ MCPツールはすべて登録されている
- ✅ ToolSearchで検索可能

---

## ❌ 問題が発生している部分

### 1. Extension Bridgeの接続失敗

**期待される動作**:
```
1. MCPサーバー起動
2. RelayServer起動（WebSocketサーバー）
3. ログに「RelayServer started on port XXXXX」
4. ログに「Connection URL: ws://127.0.0.1:XXXXX?token=...」
5. 拡張機能が自動接続
6. ログに「Extension connected to tab XXX」
```

**実際の動作**:
```
1. MCPサーバー起動 ✅
2. RelayServer起動？（ログに出力なし） ❌
3. take_snapshot実行時に接続試行
4. "Target closed"エラー ❌
5. フォールバック？別プロファイルでChromeが起動 ❌
```

**ログの状態**（`/tmp/chrome-ai-bridge-mcp.log`）:
```
[chrome-ai-bridge-chatgpt] [browser-globals-mock] Initialized browser globals
[chrome-ai-bridge-chatgpt] [tools] Loaded 3 optional web-llm tools
[chrome-ai-bridge-chatgpt] chrome-ai-bridge exposes content of the browser instance...
```

**問題点**:
- ❌ `[Extension Bridge] RelayServer started on port XXXXX`のログがない
- ❌ `[Extension Bridge] Waiting for Extension connection...`のログがない
- ❌ Extension Bridgeの起動ログが一切出ていない

### 2. エラーの詳細

**ツール実行時のエラー**:
```
> mcp__chrome-ai-bridge__take_snapshot()
Error: Protocol error (Target.setDiscoverTargets): Target closed

> mcp__chrome-ai-bridge__pages({ op: "list" })
Error: Protocol error (Target.setDiscoverTargets): Target closed
```

**エラーの意味**:
- CDP（Chrome DevTools Protocol）接続が確立していない
- Puppeteerのtargetが閉じられている
- Extension Bridgeの接続が成功していない

---

## 🔍 推測される原因（優先度順）

### 仮説1: Extension Bridgeが起動していない【最有力】

**根拠**:
- ログに`[Extension Bridge]`関連の出力がない
- RelayServerの起動ログがない
- 接続待機のログもない

**考えられる理由**:
1. `connectViaExtension()`が呼ばれていない
2. `getContext()`の遅延初期化で、Extension Bridgeモードが正しく判定されていない
3. `--attachTabUrl`フラグが`resolveBrowser()`に正しく渡っていない

**確認方法**:
```typescript
// src/browser.ts:1290の前にデバッグログ追加
console.error('[DEBUG] resolveBrowser options:', {
  attachTabUrl: options.attachTabUrl,
  attachTabNew: options.attachTabNew,
  extensionRelayPort: options.extensionRelayPort
});
```

### 仮説2: Extension Bridgeがタイムアウト後にフォールバック

**根拠**:
- 別のプロファイルでChromeが起動している
- 専用プロファイルパス: `~/.cache/chrome-ai-bridge/profiles/chrome-ai-bridge_XXXX/`

**考えられる理由**:
1. 30秒のタイムアウト発生（拡張機能が接続しなかった）
2. エラーハンドリングで通常のブラウザ起動にフォールバック？
3. **注意**: コード上、フォールバックロジックは存在しないはず

**確認方法**:
```bash
# ログにタイムアウトエラーがあるか確認
grep -i "timeout\|extension.*connection" /tmp/chrome-ai-bridge-mcp.log
```

### 仮説3: RelayServerが例外で停止している

**根拠**:
- RelayServerのログが一切出ない

**考えられる理由**:
1. WebSocketサーバーのポートバインド失敗
2. RelayServerのコンストラクタ/start()で例外
3. try-catchでエラーが握りつぶされている

**確認方法**:
```typescript
// src/extension/relay-server.ts に詳細ログ追加
console.error('[RelayServer] Constructor called');
console.error('[RelayServer] Starting on port:', this.port);
```

---

## 🔧 確認すべきコード箇所

### 1. CLI引数のパース（src/main.ts:173-192）

```typescript
const browserOptions = {
  browserUrl: args.browserUrl,
  headless: args.headless,
  // ...
  attachTab: args.attachTab as number | undefined,
  attachTabUrl: args.attachTabUrl as string | undefined,  // ← これが正しく渡されているか
  attachTabNew: args.attachTabNew as boolean | undefined,
  extensionRelayPort: args.extensionRelayPort as number | undefined,
};
```

**確認すべきこと**:
- `args.attachTabUrl`が`undefined`になっていないか
- `as string | undefined`のキャストが問題ないか

### 2. ResolveBrowserの分岐ロジック（src/browser.ts:1290-1300）

```typescript
// Extension Bridge mode - connect to existing tab by URL
if (options.attachTabUrl !== undefined) {
  logger(
    `[Extension Bridge] Connecting to tab with URL ${options.attachTabUrl} via Extension`,
  );
  return await connectViaExtension({
    tabUrl: options.attachTabUrl,
    newTab: options.attachTabNew,
    relayPort: options.extensionRelayPort,
  });
}
```

**確認すべきこと**:
- この分岐に入っているか（ログが出るはず）
- `options.attachTabUrl`が`undefined`になっていないか

### 3. ConnectViaExtensionの実行（src/browser.ts:1340-1434）

```typescript
export async function connectViaExtension(options: {
  tabId?: number;
  tabUrl?: string;
  newTab?: boolean;
  relayPort?: number;
}): Promise<Browser> {
  // ...
  const relay = new RelayServer({ port: options.relayPort || 0 });
  const port = await relay.start();
  logger(`[Extension Bridge] RelayServer started on port ${port}`);
  // ...
}
```

**確認すべきこと**:
- この関数が実行されているか
- エラーが発生していないか
- RelayServerの起動ログが出ているか

---

## 📝 次のステップ（優先度順）

### 優先度1: デバッグログ追加で原因特定

**追加箇所**:
```typescript
// src/browser.ts:1278-1300（resolveBrowser内）
export async function resolveBrowser(options: {
  // ...
  attachTabUrl?: string;
  // ...
}) {
  // ===== デバッグログ追加 =====
  console.error('[DEBUG resolveBrowser] options:', {
    attachTab: options.attachTab,
    attachTabUrl: options.attachTabUrl,
    attachTabNew: options.attachTabNew,
    extensionRelayPort: options.extensionRelayPort,
  });
  // ============================

  // Extension Bridge mode - connect to existing tab by ID
  if (options.attachTab !== undefined) {
    // ...
  }

  // Extension Bridge mode - connect to existing tab by URL
  if (options.attachTabUrl !== undefined) {
    // ===== デバッグログ追加 =====
    console.error('[DEBUG] Extension Bridge mode detected! Calling connectViaExtension...');
    // ============================

    logger(
      `[Extension Bridge] Connecting to tab with URL ${options.attachTabUrl} via Extension`,
    );
    return await connectViaExtension({
      tabUrl: options.attachTabUrl,
      newTab: options.attachTabNew,
      relayPort: options.extensionRelayPort,
    });
  }
  // ...
}
```

**実行方法**:
```bash
# コード修正
vim src/browser.ts

# ビルド
npm run build

# MCPサーバー再起動（Claude Code / tmux）
# take_snapshotを実行してログ確認
```

### 優先度2: ログのリアルタイム監視

```bash
# 別のtmuxペインで実行
tail -f /tmp/chrome-ai-bridge-mcp.log | grep -E "\[DEBUG\]|\[Extension Bridge\]|Error"
```

### 優先度3: 拡張機能の状態確認

**手順**:
1. Chromeで`chrome://extensions/`を開く
2. chrome-ai-bridge拡張機能を探す
3. "Service Worker を検証"をクリック
4. コンソールに接続ログが出ているか確認

**期待されるログ**:
```
[background] RelayConnection: Connecting to ws://127.0.0.1:XXXXX?token=...
[background] RelayConnection: Connected
```

---

## 🤔 重要な考察

### なぜRelayServerのログが出ないのか

**考察**: MCPサーバーは遅延初期化を使用

`src/main.ts`を見ると、ブラウザ接続は`getContext()`内で行われ、これは**最初のツール呼び出し時**に実行されます。

```typescript
// src/main.ts:256-260
async (params): Promise<CallToolResult> => {
  const guard = await toolMutex.acquire();
  try {
    logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
    const context = await getContext(); // ← ここで初めてブラウザ接続
```

**つまり**:
1. MCPサーバー起動時点ではブラウザは接続されない
2. `take_snapshot`を実行した時に初めて`resolveBrowser()`が呼ばれる
3. その時点でExtension Bridgeが起動するはず
4. **でもログが出ていない = 何かが間違っている**

**結論**: デバッグログで`resolveBrowser()`が呼ばれているか、`attachTabUrl`が渡されているかを確認する必要がある。

---

## 📚 参考：Extension Bridgeの正常な起動フロー

```
1. MCPツール呼び出し（例: take_snapshot）
   ↓
2. getContext() 実行（初回のみ）
   ↓
3. resolveBrowser(options)
   ↓
4. options.attachTabUrl !== undefined → true
   ↓
5. connectViaExtension({ tabUrl, newTab, relayPort })
   ↓
6. RelayServer.start()
   ↓
7. logger("[Extension Bridge] RelayServer started on port XXXX")
   ↓
8. 30秒待機（拡張機能の接続を待つ）
   ↓
9. relay.once('ready') イベント
   ↓
10. logger("[Extension Bridge] Extension connected to tab XXX")
   ↓
11. ExtensionTransport作成
   ↓
12. puppeteer.connect({ transport })
   ↓
13. ツール実行成功
```

**現在どこまで進んでいるか**:
- ✅ Step 1-2: MCPツール呼び出し、getContext()
- ❓ Step 3-4: resolveBrowser()、Extension Bridge分岐判定 → **ログがないため不明**
- ❌ Step 5-13: connectViaExtension()以降 → **実行されていない**

---

## 💡 解決への最短ルート

### Step 1: デバッグログ追加（5分）

```typescript
// src/browser.ts:1278付近
console.error('[DEBUG] resolveBrowser called with:', {
  attachTabUrl: options.attachTabUrl,
  attachTabNew: options.attachTabNew,
});
```

### Step 2: ビルド・再起動（2分）

```bash
npm run build
# Claude Code / tmux で MCPサーバー再起動
```

### Step 3: ツール実行・ログ確認（1分）

```bash
# take_snapshotを実行
# /tmp/chrome-ai-bridge-mcp.logを確認
```

### Step 4: 原因特定（即座）

- ✅ `[DEBUG] resolveBrowser called with: { attachTabUrl: 'https://chatgpt.com/', ... }`が出る
  → 次のステップへ進む（Extension Bridge内部の問題）

- ❌ `[DEBUG]`ログが出ない
  → `getContext()`が呼ばれていない → ツール実行フローを確認

- ❌ `attachTabUrl: undefined`になっている
  → CLI引数のパース問題 → `src/main.ts:189`を確認

---

よろしくお願いします。
