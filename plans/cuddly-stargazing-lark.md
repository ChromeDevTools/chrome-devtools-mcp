# Extension Bridge実装プラン

## 目的

chrome-ai-bridgeを**Extension Bridge専用**に変更し、ユーザーの既存Chromeブラウザのタブに接続する方式に移行する。複数タブの同時管理（ChatGPT + Gemini同時操作など）をサポート。

## 設計方針

### アーキテクチャ変更

**Before（削除する方式）:**
```
chrome-ai-bridge起動
  ↓
新しいChromeインスタンスを起動（専用プロファイル）
  ↓
Puppeteer経由でタブ操作
```

**After（新しい方式）:**
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

```typescript
// 同時操作の例
await attachTab({ tabId: 101 }); // ChatGPTタブ
await attachTab({ tabId: 102 }); // Geminiタブ
await takeSnapshot({ tabId: 101 }); // ChatGPTのDOM取得
await takeSnapshot({ tabId: 102 }); // GeminiのDOM取得
```

---

## 実装ステータス

- ✅ Phase 1: Extension実装（完了）
- ✅ Phase 2: MCPサーバー側対応（完了）
- ⏸️ Phase 2（複数タブ対応）: スキップ（複数プロセス方式を採用）
- ⏳ Phase 3: 既存コード削除（未実施）
- ⏳ Phase 4: E2Eテスト（準備完了、実施待ち）

**設計変更**: 当初の「単一プロセス+TabManager」から「複数プロセス（1プロセス=1タブ）」に変更。これにより Phase 2の複数タブ対応は不要になりました。

---

## 実装フェーズ

### Phase 1: Extension実装（✅ 完了）

#### 1.1 拡張機能ファイル作成

**`src/extension/manifest.json`** - Playwright extension2ベース
```json
{
  "manifest_version": 3,
  "name": "chrome-ai-bridge Extension",
  "version": "1.0.0",
  "permissions": ["debugger", "activeTab", "tabs", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.mjs",
    "type": "module"
  },
  "action": {
    "default_title": "chrome-ai-bridge"
  }
}
```

**`src/extension/background.mjs`** - WebSocket ↔ chrome.debugger 中継
- `RelayConnection` クラス: 単一タブ接続管理
- `TabShareExtension` クラス: 複数接続・ライフサイクル管理
- Playwright extension2の実装を移植

**`src/extension/ui/connect.html`** - タブ選択UI
- loopback検証（127.0.0.1のみ許可）
- token認証
- タブ一覧表示・選択

**`src/extension/ui/connect.js`** - UI ロジック
- React or Vanilla JS（Playwrightと同等の機能）

#### 1.2 WebSocket Relay Server

**`src/extension/relay-server.ts`**
```typescript
import WebSocket from 'ws';

export class RelayServer {
  private wss: WebSocket.Server;
  private connections: Map<number, WebSocket>; // tabId -> WebSocket

  constructor(port: number = 0) {
    this.wss = new WebSocket.Server({
      host: '127.0.0.1',
      port
    });
    this.connections = new Map();
  }

  async start(): Promise<number> {
    // WebSocketサーバー起動
    // token検証
    // 接続イベント処理
  }

  sendCDPCommand(tabId: number, method: string, params: any): Promise<any> {
    // forwardCDPCommand送信
  }

  onCDPEvent(callback: (tabId: number, method: string, params: any) => void) {
    // forwardCDPEvent受信
  }
}
```

#### 1.3 Puppeteer Transport実装

**`src/extension/extension-transport.ts`**
```typescript
import { ConnectionTransport } from 'puppeteer-core';

export class ExtensionTransport implements ConnectionTransport {
  private relay: RelayServer;
  private tabId: number;

  send(message: string): void {
    // CDP JSON-RPC → forwardCDPCommand
  }

  close(): void {
    // 接続終了
  }

  onmessage?: (message: string) => void;
  onclose?: () => void;
}
```

**実装内容:**
- `src/extension/manifest.json` - 拡張機能マニフェスト作成済み
- `src/extension/background.mjs` - TabShareExtension + RelayConnection実装済み
- `src/extension/ui/connect.html` - タブ選択UI作成済み
- `src/extension/ui/connect.js` - UIロジック実装済み
- `src/extension/relay-server.ts` - WebSocketサーバー実装済み
- `src/extension/extension-transport.ts` - Puppeteer Transport実装済み
- `src/extension/README.md` - ドキュメント作成済み

---

### Phase 2: MCPサーバー側対応（✅ 完了）

**実装内容:**
- `src/browser.ts` - connectViaExtension()追加、resolveBrowser()にattachTab対応追加
- `src/cli.ts` - --attachTab、--extensionRelayPortフラグ追加
- `src/main.ts` - Extension Bridge引数の渡し対応
- `scripts/post-build.ts` - 拡張機能ファイルのビルド対応追加
- 依存関係: ws、@types/ws追加

---

### Phase 2（複数タブ対応）: ⏸️ スキップ

**理由**: 複数プロセス方式を採用したため、TabManagerおよびMCPツールへのtabIdパラメータ追加は不要になりました。

**採用した設計:**
- 各MCPサーバープロセスは起動時に固定のタブに接続（--attachTab=XXX）
- MCPツールにtabIdパラメータは不要
- 複数タブ管理はOS/Nodeのプロセス管理に任せる

**不要になった実装:**

#### 2.1 TabManager実装

**`src/extension/tab-manager.ts`**
```typescript
export class TabManager {
  private connections: Map<number, RelayConnection>;

  async attachTab(tabId: number): Promise<void> {
    // 新しいタブに接続
  }

  async detachTab(tabId: number): Promise<void> {
    // タブから切断
  }

  getConnection(tabId: number): RelayConnection | undefined {
    return this.connections.get(tabId);
  }

  getAllTabs(): number[] {
    return Array.from(this.connections.keys());
  }
}
```

#### 2.2 MCPツールの変更

**全ツールに `tabId` パラメータ追加:**

```typescript
// src/tools/debugging.ts
export const takeSnapshotTool = {
  schema: {
    type: 'object',
    properties: {
      tabId: {
        type: 'number',
        description: 'Target tab ID'
      },
      // ... 既存パラメータ
    },
    required: ['tabId'],
  },
  async execute(context: McpContext, { tabId, ...params }) {
    const page = context.getPage(tabId);
    // ...
  }
};
```

**影響を受けるツール:**
- `src/tools/navigation.ts` - navigate, new_page, close_page等
- `src/tools/input.ts` - click, fill, drag等
- `src/tools/debugging.ts` - screenshot, snapshot等
- `src/tools/performance.ts` - trace等
- `src/tools/network.ts` - list_network_requests等

#### 2.3 McpContext変更

**`src/McpContext.ts`**
```typescript
export class McpContext {
  private tabManager: TabManager;

  getPage(tabId: number): Page {
    const connection = this.tabManager.getConnection(tabId);
    if (!connection) {
      throw new Error(`Tab ${tabId} is not connected`);
    }
    return connection.getPage();
  }

  async listTabs(): Promise<number[]> {
    return this.tabManager.getAllTabs();
  }
}
```

---

### Phase 3: 既存コード削除

#### 3.1 browser.ts大幅削減

**削除対象:**
- `launch()` 関数全体（Line 786-1239）
- Phase 4実装（open -g + puppeteer.connect）
- 専用プロファイル管理
- `--channel`, `--headless`, `--isolated` 等のCLI処理

**残すもの:**
- `Browser` クラスの型定義（Puppeteerインターフェース互換のため）
- ユーティリティ関数（必要なもののみ）

#### 3.2 不要ファイル削除

- `src/profile-manager.ts` - 削除
- `src/bookmark-injector.ts` - 削除
- `src/applescript-helper.ts` - 削除（macOS専用の起動制御）

#### 3.3 CLI簡素化

**`src/cli.ts` 変更:**
```typescript
// Before: 多数のオプション
--channel, --headless, --isolated, --loadExtension, 等

// After: 最小限
--port <number>        # WebSocket Relayポート（デフォルト: 自動）
--token <string>       # 認証トークン（デフォルト: 自動生成）
--extensionPath <path> # 拡張機能の配布パス（開発用）
```

---

### Phase 4: E2Eテスト（⏳ 準備完了）

実装は完了しており、以下のE2Eテストを実施予定:

#### テストシナリオ

1. **単一タブ接続テスト**
   - chrome-ai-bridge-chatgptプロセスがTab 101に接続
   - take_snapshot、click、navigate等の基本操作を確認

2. **複数タブ同時操作テスト**
   - chrome-ai-bridge-chatgpt（Tab 101）とchrome-ai-bridge-gemini（Tab 102）を同時起動
   - 両タブで独立してMCPツールが動作することを確認
   - 操作が互いに干渉しないことを確認

3. **サブエージェント同時実行テスト**
   - メインエージェント（Claude）が2つのサブエージェントを並列起動
   - ChatGPTとGeminiに同時に質問を投げ、結果を集約
   - 複数プロセス方式の有効性を検証

---

## 重要ファイル一覧

### 新規作成
- `src/extension/manifest.json` - 拡張機能設定
- `src/extension/background.mjs` - Service Worker
- `src/extension/ui/connect.html` - タブ選択UI
- `src/extension/ui/connect.js` - UIロジック
- `src/extension/relay-server.ts` - WebSocketサーバー
- `src/extension/extension-transport.ts` - Puppeteer Transport
- `src/extension/tab-manager.ts` - 複数タブ管理
- `src/tools/tab-management.ts` - タブ管理MCPツール

### 大幅変更
- `src/browser.ts` - launch()削除、Extension用に最小化
- `src/McpContext.ts` - TabManager統合、getPage(tabId)追加
- `src/cli.ts` - CLI簡素化
- `src/main.ts` - RelayServer起動ロジック追加
- `src/tools/*.ts` - 全ツールにtabIdパラメータ追加

### 削除
- `src/profile-manager.ts`
- `src/bookmark-injector.ts`
- `src/applescript-helper.ts`

---

## 検証方法

### セットアップ

#### 1. ビルド

```bash
npm run build
```

#### 2. プロジェクトローカルMCP設定作成

プロジェクトルートに `.mcp.json` を作成:

```json
{
  "mcpServers": {
    "chrome-ai-bridge-chatgpt": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTab=101"
      ]
    },
    "chrome-ai-bridge-gemini": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTab=102"
      ]
    }
  }
}
```

または CLI で追加:

```bash
claude mcp add --transport stdio --scope project chrome-ai-bridge-chatgpt \
  -- node /Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs --attachTab=101

claude mcp add --transport stdio --scope project chrome-ai-bridge-gemini \
  -- node /Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs --attachTab=102
```

#### 3. 拡張機能インストール

1. Chromeで `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `build/extension/` ディレクトリを選択

#### 4. Chromeタブ準備

- Tab 101: https://chatgpt.com を開く
- Tab 102: https://gemini.google.com を開く

タブIDの確認方法:
```
chrome://inspect/#pages
```

### E2Eテストシナリオ

#### 1. Claude Code起動

```bash
cd /Users/usedhonda/projects/mcp/chrome-ai-bridge
claude
```

MCPサーバーが自動起動し、ログに以下が表示される:

```
[Extension Bridge] RelayServer started on port 12345
[Extension Bridge] Connection URL: ws://127.0.0.1:12345?token=xxxxx
```

#### 2. 拡張機能UIで接続

拡張機能のアイコンをクリック、または直接URLを開く:

```
chrome-extension://[EXTENSION_ID]/ui/connect.html?mcpRelayUrl=ws://127.0.0.1:12345&token=xxxxx&tabId=101
```

タブを選択して「Connect to Selected Tab」をクリック

同様に、2つ目のプロセス用にもTab 102で接続

#### 3. MCPツールでテスト

Claude Code内で:

```
> /mcp
chrome-ai-bridge-chatgpt: connected
chrome-ai-bridge-gemini: connected
```

MCPツールを使ってテスト:

```javascript
// ChatGPTタブの操作
take_snapshot() // chrome-ai-bridge-chatgptプロセス経由

// Geminiタブの操作
take_snapshot() // chrome-ai-bridge-geminiプロセス経由
```

### ユニットテスト

- RelayServerの接続・切断
- ExtensionTransportのCDPメッセージ変換
- TabManagerの複数タブ管理
- 各MCPツールのtabIdパラメータ検証

---

## リスクと対策

### リスク1: Puppeteer互換性
**問題**: Puppeteer は browser target 前提、単一タブCDPでは不足する可能性

**対策**:
- 最小CDP実装でMVPを作成
- 動作しない機能は段階的に追加

### リスク2: MV3 Service Worker停止
**問題**: Service Workerが非アクティブ時にWS接続が切れる

**対策**:
- タブごとに keep-alive メッセージ
- 再接続ロジック実装

### リスク3: 既存MCPツールの互換性
**問題**: 全ツールに `tabId` 必須化でAPIが破壊的変更

**対策**:
- デフォルトタブ機能（最初に接続したタブを暗黙的に使用）
- 段階的な移行期間を設ける

---

## 次のステップ

1. ✅ ブランチ作成: `feature/extension-bridge`
2. ✅ Phase 1実装: Extension基本機能
3. ✅ Phase 2実装: MCPサーバー側対応
4. ✅ ビルド確認
5. ✅ ドキュメント作成
6. ✅ Git コミット
7. ✅ `.mcp.json`設定作成（テスト準備）
8. ✅ E2Eテストガイド作成
9. ⏳ 拡張機能インストール（ユーザー操作が必要）
10. ⏳ E2Eテスト実施（ユーザー操作が必要）
11. ⏳ Phase 3実装: 既存コード削除（Extension Bridge安定後）
12. ⏳ mainへマージ

## 実装完了の確認事項

### 完了済み

- ✅ Extension ファイル作成（manifest.json, background.mjs, connect.html/js）
- ✅ RelayServer実装（WebSocketサーバー）
- ✅ ExtensionTransport実装（Puppeteer互換）
- ✅ browser.ts: connectViaExtension()追加
- ✅ cli.ts: --attachTab、--extensionRelayPortフラグ追加
- ✅ main.ts: Extension Bridge引数渡し対応
- ✅ post-build.ts: 拡張機能ファイルのビルド対応
- ✅ 依存関係追加: ws、@types/ws
- ✅ ビルド成功
- ✅ 型チェック成功
- ✅ ドキュメント作成（README.md、設計書、作業ログ）

### 次の実施事項

1. ✅ `.mcp.json`を作成してMCPサーバー2つを登録
2. ✅ E2Eテストガイド作成 (`docs/extension-bridge-test-guide.md`)
3. ⏳ 拡張機能をChromeにインストール（ユーザー操作が必要）
4. ⏳ E2Eテスト実施（ユーザー操作が必要）
5. ⏳ 必要に応じてPhase 3（既存コード削除）を実施
