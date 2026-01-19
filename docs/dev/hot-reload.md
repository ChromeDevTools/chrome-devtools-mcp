# Hot-Reload開発環境セットアップガイド

## 📋 概要

このガイドでは、VSCode Reload Window不要の開発環境を設定します。

**Before（従来）**:
1. TypeScript編集
2. `npm run build`
3. `npm run restart-mcp`
4. **VSCode Reload Window** ← 面倒
5. 動作確認

**After（Hot-Reload）**:
1. TypeScript編集
2. **自動ビルド → 自動再起動** ← これだけ！
3. 動作確認

## 🚀 セットアップ手順

### Step 1: VSCode MCP設定の変更

VSCodeのMCP設定ファイルを編集します。

**設定ファイルの場所**:
- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- または Claude Code拡張の設定UI

**変更内容**:

#### Before（従来の設定）
```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["/Users/usedhonda/projects/chrome-ai-bridge/build/src/index.js"],
      "env": {}
    }
  }
}
```

#### After（Hot-Reload設定）
```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/chrome-ai-bridge/scripts/mcp-wrapper.mjs",
        "--dev"
      ],
      "cwd": "/Users/usedhonda/projects/chrome-ai-bridge",
      "env": {}
    }
  }
}
```

**重要な変更点**:
1. `args[0]`: `build/src/index.js` → `scripts/mcp-wrapper.mjs`
2. `args[1]`: `--dev` フラグを追加
3. `cwd`: プロジェクトルートを明示

### Step 2: VSCode Reload Window

設定変更後、**1回だけ**VSCode Reload Windowを実行：
- **Cmd+R** または
- Command Palette → "Developer: Reload Window"

### Step 3: 動作確認

VSCode再起動後、MCPサーバーが自動的に開発モードで起動します。

**ターミナルで確認**（オプション）:
```bash
# MCPプロセスを確認
ps aux | grep mcp-wrapper

# 出力例:
# usedhonda  12345  node scripts/mcp-wrapper.mjs --dev
```

**MCPサーバーのログ**:
VSCodeの出力パネル（Output → Claude Code）で以下のようなログが確認できます：

```
[mcp-wrapper] ========================================
[mcp-wrapper] DEVELOPMENT MODE
[mcp-wrapper] ========================================
[mcp-wrapper] - tsc -w for auto-compilation
[mcp-wrapper] - Watching: build/**/*.{js,mjs,cjs,map}
[mcp-wrapper] - Hot-reload: ON
[mcp-wrapper] ========================================
[tsc] Starting compilation in watch mode...
[mcp-wrapper] Waiting for initial build...
[mcp-wrapper] Starting child: node build/src/index.js
[mcp-wrapper] Hot-reload active! Edit TypeScript files to see changes.
```

## 🧪 Hot-Reloadのテスト

### テスト1: コメント追加で動作確認

1. **TypeScriptファイルを編集**:
   ```bash
   # 例: src/index.ts の先頭にコメント追加
   echo "// Hot-reload test" >> src/index.ts
   ```

2. **自動ビルド・再起動を確認**:
   VSCodeの出力パネルで以下が表示されます：
   ```
   [tsc] File change detected. Starting incremental compilation...
   [tsc] Found 0 errors. Watching for file changes.
   [mcp-wrapper] Build changed: change build/src/index.js
   [mcp-wrapper] Restarting child...
   [mcp-wrapper] Sent SIGTERM to child
   [mcp-wrapper] Starting child: node build/src/index.js
   ```

3. **MCPツールが即座に使える**:
   ```
   # Claude Codeで任意のMCPツールを実行
   # 例: list_pages
   ```

4. **VSCode操作は一切不要** ✅

### テスト2: 実際のコード変更

1. **機能追加**（例: login-helper.tsのログ追加）:
   ```typescript
   // src/login-helper.ts
   export async function isLoginRequired(page: Page): Promise<boolean> {
     console.error('[login-helper] Hot-reload test: checking login status');
     // ... existing code
   }
   ```

2. **保存** → **数秒待つ** → **自動反映**

3. **動作確認**:
   ChatGPTツールを実行すると、新しいログが表示されます

## 📝 開発ワークフロー

### 日常的な開発

```bash
# 1. VSCode起動（MCPは自動起動）
code /Users/usedhonda/projects/chrome-ai-bridge

# 2. TypeScript編集
# src/**/*.ts を自由に編集

# 3. 保存するだけ
# → 自動ビルド → 自動再起動 → 即座に反映

# 4. VSCode操作は不要！
```

### トラブルシューティング

#### 問題: MCPサーバーが起動しない

**確認1: tscエラー**
```bash
# ターミナルで手動ビルド
npm run build

# エラーがあれば修正
```

**確認2: mcp-wrapperのログ**
VSCode Output → Claude Code でエラーメッセージを確認

**確認3: プロセス確認**
```bash
# MCPプロセスが起動しているか
ps aux | grep mcp-wrapper
```

#### 問題: Hot-Reloadが動作しない

**確認1: 開発モードで起動しているか**
```bash
# --dev フラグがあるか確認
ps aux | grep mcp-wrapper | grep -- --dev
```

**確認2: tsc -w が動いているか**
```bash
# tscプロセスが存在するか
ps aux | grep 'tsc -w'
```

**確認3: ファイル監視が動いているか**
VSCode Outputで `[mcp-wrapper] Build changed:` が表示されるか確認

#### 問題: Chromeプロセスが残る

**手動クリーンアップ**:
```bash
# Chromeプロセスを確認
ps aux | grep Chrome

# PIDファイルの確認
ls -la /tmp/mcp-browser-*.pid

# 手動でkill
kill -9 {Chrome PID}
rm /tmp/mcp-browser-*.pid
```

**mcp-wrapperは自動的にクリーンアップしますが、万が一残った場合のみ使用**

## 🔧 高度な設定

### 環境変数によるカスタマイズ

VSCode MCP設定の`env`で以下を設定可能：

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["scripts/mcp-wrapper.mjs", "--dev"],
      "env": {
        "MCP_KILL_TIMEOUT_MS": "5000",
        "MCP_BUILD_GLOB": "build/**/*.{js,mjs}"
      }
    }
  }
}
```

**利用可能な環境変数**:
- `MCP_KILL_TIMEOUT_MS`: 子プロセス終了待機時間（デフォルト: 4000ms）
- `MCP_BUILD_GLOB`: 監視対象ファイルパターン（デフォルト: `build/**/*.{js,mjs,cjs,map}`）
- `MCP_TS_PROJECT`: tsconfig.jsonのパス（デフォルト: `tsconfig.json`）

### デバッグモード

より詳細なログを見たい場合：

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["scripts/mcp-wrapper.mjs", "--dev"],
      "env": {
        "DEBUG": "mcp:*",
        "DEBUG_COLORS": "false"
      }
    }
  }
}
```

## 📊 パフォーマンス

### Hot-Reloadの速度

典型的なコード変更から反映までの時間：

1. **ファイル保存**: 0秒
2. **tsc -w コンパイル**: 1-3秒（変更ファイル数による）
3. **chokidar検出**: 0.1秒
4. **子プロセス再起動**: 0.5-1秒
5. **MCP再接続**: 0.1秒

**合計: 約2-5秒**

VSCode Reload Window（10-15秒）と比較して**3-7倍高速**

### リソース使用量

**開発モード追加コスト**:
- `tsc -w`: CPU 5-10%, RAM ~100MB
- `chokidar`: CPU <1%, RAM ~20MB
- `mcp-wrapper.mjs`: CPU <1%, RAM ~50MB

**合計追加コスト**: RAM ~170MB, CPU ~10%（アイドル時は<1%）

## 🎯 まとめ

### ✅ 達成したこと
- VSCode Reload Window不要
- 開発速度が3-7倍向上
- Chromeプロセスの自動クリーンアップ
- stdio接続の安定化

### 📋 次のPhase（オプション）
- **Phase 2**: Graceful Shutdown（Chrome終了の確実性向上）
- **Phase 3**: 本番Auto-Restart（ユーザー環境での自動復旧）
- **Phase 4**: Health Check（バージョン確認ツール）

### 🔗 関連ドキュメント
- [Implementation Plan](251004_184541-mcp-hot-reload-implementation-plan.md)
- [ChatGPT Discussion](docs/ask/chatgpt/.../015-mcp-hot-reload.md)

---

**質問・問題があれば、このガイドを参照してください。**
