# MCP Hot-Reload & Auto-Restart 実装プラン

## 📅 作成情報
- **日時**: 2025-10-04 18:45:41
- **担当**: Claude 4.5 + ChatGPT o1
- **目的**: VSCode Reload Window不要の開発体験実現

## 🎯 目標

### 現状の問題
1. TypeScriptコード修正後、`npm run build` 実行
2. `npm run restart-mcp` でプロセス終了
3. **VSCode Reload Window必須** ← これが煩雑
4. やっと新しいコードが動作

### 理想の状態
1. TypeScriptコード修正
2. **自動ビルド → 自動再起動**
3. 即座に新コードが反映（VSCode操作不要）

## 🏗 アーキテクチャ設計

### コア戦略: 安定ラッパー方式

```
MCPクライアント（Claude Code拡張）
    ↓ stdio接続（維持）
┌─────────────────────────┐
│  mcp-wrapper.mjs       │ ← 親プロセス（常駐）
│  - stdio接続を保持      │
│  - 子プロセスのみ再起動 │
└─────────────────────────┘
    ↓ spawn/kill
┌─────────────────────────┐
│  build/src/index.js    │ ← 子プロセス（再起動可能）
│  - MCPサーバー本体      │
│  - Puppeteer/Chrome管理 │
└─────────────────────────┘
```

**重要ポイント**:
- **親（ラッパー）は不変** → stdio接続が切れない
- **子（サーバー）のみ再起動** → 新コードが反映される
- **stdoutは純粋なJSON-RPC** → ログは全てstderrへ

### モード分離

#### 開発モード（`--dev` または `MCP_ENV=development`）
- **ビルド**: `tsc -w` で自動ビルド
- **監視**: `chokidar` で `build/**/*.js` を監視
- **再起動**: ファイル変更検出 → 子プロセスのみ再起動
- **クラッシュ**: 自動再起動しない（無限ループ防止）

#### 本番モード（デフォルト）
- **ビルド**: 事前ビルド済み `build/src/index.js` を実行
- **監視**: なし
- **再起動**: クラッシュ時のみ自動再起動（指数バックオフ + レート制限）
- **制限**: 1分間に8回以上の再起動で停止

## 📁 ファイル構成

```
chrome-ai-bridge/
├── scripts/
│   ├── mcp-wrapper.mjs        # 統合ラッパー（開発・本番両対応）
│   ├── cli.mjs                # bin エントリーポイント
│   └── restart-mcp.sh         # 既存（後方互換）
├── src/
│   ├── graceful.ts            # Graceful shutdown ロジック
│   ├── index.ts               # MCPサーバー本体（修正必要）
│   └── ...
├── package.json               # bin / scripts 追加
└── tsconfig.json
```

## 🔧 実装詳細

### 1. scripts/mcp-wrapper.mjs（統合ラッパー）

**責務**:
- stdio接続の維持
- 子プロセスの起動・監視・再起動
- Chrome孤児プロセスのクリーンアップ

**開発モード**:
1. `tsc -w` をバックグラウンド起動（stdout → stderr転送）
2. `chokidar` で `build/**/*.{js,mjs}` を監視
3. 変更検出 → `SIGTERM` → 子再起動
4. タイムアウト（4秒）後に `SIGKILL`

**本番モード**:
1. 子プロセス起動
2. クラッシュ検出 → 指数バックオフ再起動
   - 初回: 300ms待機
   - 2回目: 600ms待機
   - ...
   - 最大: 30秒待機
3. 1分間に8回以上再起動 → 停止（無限ループ防止）

**Chrome PIDファイル連携**:
- 環境変数 `MCP_BROWSER_PID_FILE=/tmp/mcp-browser-{親PID}.pid` を子に渡す
- 子（サーバー）は起動したChromeのPIDを書き込む
- 子クラッシュ時、ラッパーがPIDファイルを読んで `SIGKILL`

### 2. src/graceful.ts（Graceful Shutdown）

**責務**:
- `browser.close()` の確実な実行
- タイムアウト付きクリーンアップ
- PIDファイルへのChrome PID書き込み

**シグナルハンドリング**:
- `SIGTERM` / `SIGINT` → Graceful shutdown
- `disconnect` → 親死亡検知 → 即座にshutdown
- `uncaughtException` / `unhandledRejection` → ログ出力 → shutdown

**処理フロー**:
1. `browser.close()` 実行（タイムアウト3秒）
2. タイムアウトまたは失敗 → PIDファイルから読み取り → `SIGKILL`
3. PIDファイル削除
4. `process.exit(0)`

### 3. scripts/cli.mjs（bin エントリー）

**責務**:
- ユーザーが `npx chrome-ai-bridge` で起動時のエントリー
- 本番モード固定で `mcp-wrapper.mjs` を起動

```javascript
#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const child = spawn(process.execPath, ["scripts/mcp-wrapper.mjs"], {
  stdio: "inherit",
  env: { ...process.env, MCP_ENV: "production" }
});
child.on("exit", (c) => process.exit(c ?? 0));
```

### 4. package.json 修正

```json
{
  "type": "module",
  "bin": {
    "chrome-ai-bridge": "scripts/cli.mjs"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "MCP_ENV=development node scripts/mcp-wrapper.mjs",
    "start": "MCP_ENV=production node scripts/mcp-wrapper.mjs",
    "restart-mcp": "bash scripts/restart-mcp.sh"
  },
  "devDependencies": {
    "chokidar": "^4.0.0",
    "typescript": "^5.6.0"
  }
}
```

### 5. src/index.ts 修正（Graceful組み込み）

```typescript
import { setupGraceful } from './graceful.js';
import { Browser } from 'puppeteer-core';

let browser: Browser | null = null;

// Graceful shutdownセットアップ
const graceful = setupGraceful({
  getBrowser: () => browser,
  onBeforeExit: async () => {
    // 必要ならDB/ファイルのflush等
  },
});

// Puppeteer起動後
browser = await puppeteer.launch({ /* ... */ });
const pid = browser.process()?.pid;
if (pid) {
  await graceful.announceBrowserPid(pid);
}

// ... MCPサーバー起動
```

## 🚀 実装優先順位

### Phase 1: 開発用Hot-Reload（最優先）
- [ ] `scripts/mcp-wrapper.mjs` 実装（devモードのみ）
- [ ] `chokidar` 依存追加
- [ ] `npm run dev` で動作確認
- [ ] VSCode MCP設定を `mcp-wrapper.mjs --dev` に変更

**効果**: VSCode Reload Window不要で開発速度が劇的向上

### Phase 2: Graceful Shutdown（安全性）
- [ ] `src/graceful.ts` 実装
- [ ] `src/index.ts` に組み込み
- [ ] Chrome孤児プロセステスト

**効果**: Chromeプロセスの確実なクリーンアップ、プロファイルロック問題の解消

### Phase 3: 本番Auto-Restart（ユーザー体験）
- [ ] `mcp-wrapper.mjs` に本番モード実装
- [ ] 指数バックオフ + レート制限
- [ ] `scripts/cli.mjs` 実装
- [ ] `package.json` の `bin` 設定

**効果**: ユーザー環境でのクラッシュ時自動復旧

### Phase 4: Health Check（デバッグ性）（任意）
- [ ] `health_check` MCPツール実装
- [ ] バージョン、稼働時間、Chrome状態を返す

**効果**: デバッグ時の状態確認が容易に

## 📝 使用方法

### 開発者

```bash
# 開発モード起動（hot-reload有効）
npm run dev

# TypeScript編集 → 自動ビルド → 自動再起動 → VSCode操作不要
```

**VSCode MCP設定**（開発時）:
```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["scripts/mcp-wrapper.mjs", "--dev"],
      "cwd": "/Users/usedhonda/projects/chrome-ai-bridge"
    }
  }
}
```

### ユーザー

```bash
# グローバルインストール
npm install -g chrome-ai-bridge

# 起動（auto-restart有効）
chrome-ai-bridge

# または npx
npx chrome-ai-bridge
```

**VSCode MCP設定**（本番）:
```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "chrome-ai-bridge"
    }
  }
}
```

## 🔍 技術的な考慮事項

### なぜ `tsx watch` ではなく `tsc -w`？
- **理由**: MCPのstdioはJSON-RPC専用。watcher自身がstdoutにログを出すとプロトコルが壊れる
- **対策**: `tsc -w` の出力を `pipe` で受けて `stderr` へ転送
- **代替**: `tsx watch` が完全サイレントであることを確認できれば採用可能

### Chrome PIDファイルの必要性
- **問題**: 子プロセスクラッシュ時、`browser.close()` が実行されずChromeが孤児化
- **解決**: 子が起動時にChrome PIDをファイル書き込み → ラッパーが最終掃除
- **場所**: `/tmp/mcp-browser-{親PID}.pid` （親PIDで一意化）

### レート制限の重要性
- **問題**: 設定ミスやバグで無限再起動ループ
- **解決**: 1分間に8回以上の再起動で停止
- **backoff**: 初回300ms → 最大30秒（指数増加）

### stdio汚染の防止
- **重要**: ラッパーは絶対にstdoutを使わない（`console.error` のみ）
- **tsc -w**: stdoutを `pipe` で受けて `stderr` へ転送
- **子プロセス**: stdoutはそのまま親へ（JSON-RPCが流れる）

## 🧪 テスト計画

### 開発モードテスト
1. `npm run dev` 起動
2. `src/index.ts` 修正
3. 5秒以内に変更反映を確認
4. VSCode操作なしでツールが動作

### 本番モードテスト
1. わざとクラッシュさせる（`throw new Error()`）
2. 自動再起動を確認
3. 1分間に8回クラッシュ → 停止を確認

### Chrome孤児テスト
1. 開発モードでChrome起動中に強制終了（`kill -9 {子PID}`）
2. PIDファイルからChromeがkillされることを確認

### 長時間稼働テスト
1. 本番モードで24時間起動
2. backoffが正常にリセットされることを確認

## 📚 参考資料

### ChatGPT議論ログ
- [MCP hot-reload基礎](docs/ask/chatgpt/.../015-251004_184241-mcp-model-context-protocol-サーバ.md)
- [詳細設計](docs/ask/chatgpt/.../016-251004_184530-素晴らしい回答ありがとうございます-さらに深掘りして検討した.md)

### 他のMCPサーバー事例
- **mcpmon**: npmパッケージ、MCPラッパー専用ツール
- **filesystem MCP**: nodemon方式採用
- **puppeteer MCP**: HTTP transportで回避

### 関連Issue
- [MCP auto-reconnect要望](https://github.com/modelcontextprotocol/servers/issues/xxx)（コミュニティ）
- [Claude Code拡張の再接続問題](https://github.com/anthropics/claude-code/issues/xxx)

## ✅ 成功基準

### 開発体験
- [ ] TypeScript修正後、5秒以内に反映
- [ ] VSCode Reload Window操作が不要
- [ ] ログが `console.error` で確認可能

### 本番環境
- [ ] クラッシュ時に自動再起動
- [ ] Chrome孤児プロセスが発生しない
- [ ] 無限ループで停止する

### ユーザー体験
- [ ] `npx chrome-ai-bridge` で即起動
- [ ] VSCode MCP設定が簡潔（1行）

## 🎯 次のステップ

1. **Phase 1実装**: `mcp-wrapper.mjs` 開発モード
2. **動作確認**: 実際の開発で使用してフィードバック
3. **Phase 2実装**: Graceful shutdown
4. **Phase 3実装**: 本番auto-restart
5. **ドキュメント更新**: README.mdに使用方法追記

---

**このプランに基づき、まずPhase 1（開発用Hot-Reload）から実装を開始します。**
