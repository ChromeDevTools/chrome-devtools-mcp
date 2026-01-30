# MCPサーバーが起動しない問題 - 事実のまとめ

**作成日時**: 2026-01-28 14:10
**担当**: Claude 4.5 → Codex へ引き継ぎ

---

## 📋 事実の記録

### 1. 現象

- **MCPツールが利用不可**: `mcp__chrome-ai-bridge-chatgpt__take_snapshot` を呼ぶと `No such tool available` エラー
- **プロセスが見つからない**: `ps aux | grep "attachTabUrl"` で該当プロセスなし
- **VSCode再起動済み**: Cmd+R で Reload Window 実施済み

### 2. 設定ファイル

#### このプロジェクトの `.mcp.json` (認識されていない)

```json
{
  "mcpServers": {
    "chrome-ai-bridge-chatgpt": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTabUrl=https://chatgpt.com/",
        "--attachTabNew"
      ]
    },
    "chrome-ai-bridge-gemini": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTabUrl=https://gemini.google.com/app",
        "--attachTabNew"
      ]
    }
  }
}
```

#### 他のプロジェクトの `.mcp.json` (正常に動作)

パス: `/Users/usedhonda/projects/claude/skills/ask-ai/.mcp.json`

```json
{
  "mcpServers": {
    "playwright_chatgpt": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--extension"]
    },
    "playwright_gemini": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--extension"]
    }
  }
}
```

**他のプロジェクトでは正常に動作している** → `.mcp.json`の仕組み自体は機能している

### 3. 動作確認

#### 手動起動: ✅ 成功

```bash
node scripts/cli.mjs --attachTabUrl=https://chatgpt.com/ --attachTabNew
```

**結果:**
- プロセスは起動する
- 以下のログが出る:
  ```
  [browser-globals-mock] Initialized browser globals (location, self, localStorage) for Node.js
  [tools] Loaded 3 optional web-llm tools (experimental, may break)
  chrome-ai-bridge exposes content of the browser instance to the MCP clients...
  ```
- プロセスは起動し続ける（`ps -p $PID` で確認済み）

#### ビルド: ✅ 成功

```bash
npm run build
```

拡張機能ファイルも正しくコピーされている。

#### yargs conflicts: ✅ 解決済み

Codexが修正完了（docs/log/codex/010.md）:
- `headless`, `isolated`, `loadSystemExtensions` の `default` 値を削除
- `browser.ts` で分割代入時にデフォルト値を設定

### 4. 他のMCPサーバーの起動状況

現在動作中のMCPサーバー（他のプロジェクト）:

```bash
ps aux | grep -E "playwright-mcp|context7-mcp" | grep -v grep
```

**結果:**
- `playwright-mcp --extension` (複数プロセス)
- `context7-mcp`
- `--claude-in-chrome-mcp`

→ **他のプロジェクトのMCPサーバーは正常に起動している**

### 5. このプロジェクトのプロセス状況

```bash
ps aux | grep "chrome-ai-bridge" | grep -v grep | head -5
```

**結果:**
- 古いプロセス（`--loadExtensionsDir` 指定）は多数存在
- **`--attachTabUrl` 指定のプロセスは0個**

→ **`.mcp.json` から起動されたプロセスが存在しない**

---

## 🔍 推測ではなく確認すべき事実

### VSCode Output パネルのログ

**場所:**
1. VSCode で `Cmd+Shift+P`
2. "Output: Show Output Channels" を選択
3. ドロップダウンから "Claude Code" を選択

**確認すべき内容:**
- MCPサーバーの起動ログ
- エラーメッセージ
- タイムアウト
- `.mcp.json` の読み込みログ

**Codexへの注意:**
このログはVSCode UI内にあるため、Codexから直接読めない可能性がある。
ユーザーに「ログの内容を教えてください」と質問する必要がある。

### 確認方法（ユーザーへの質問例）

```
VSCodeのOutputパネルで「Claude Code」のログを開いて、以下を確認してください：

1. .mcp.jsonの読み込みログが出ているか
2. chrome-ai-bridge-chatgpt / chrome-ai-bridge-gemini の起動ログがあるか
3. エラーメッセージが出ているか

ログの最後20-30行をコピーして教えていただけますか？
```

---

## ❌ 憶測（事実ではない）

以下は推測であり、事実ではありません:
- ~~タイムアウトで終了している~~（確認されていない）
- ~~拡張機能の接続を待っている~~（ログで確認されていない）
- ~~ローカルスクリプトだから動かない~~（手動起動は成功している）

**事実のみを基に原因を特定する必要があります。**

---

## 📝 Codexへのお願い

1. **ログの取得方法をユーザーに質問**
   - VSCodeのOutputパネルからClaude Codeのログを取得してもらう

2. **ログを見て事実を確認**
   - `.mcp.json`が読み込まれているか
   - MCPサーバーが起動しているか
   - エラーが出ているか

3. **事実ベースで原因を特定**
   - 憶測ではなく、ログに基づいて判断

4. **必要に応じて追加の事実を質問**
   - プロジェクトのパスに問題があるか
   - 他のプロジェクトとの違いは何か

---

## 📚 参考情報

- **手動起動は成功**: MCPサーバー自体に問題はない
- **他のプロジェクトは成功**: `.mcp.json`の仕組みに問題はない
- **このプロジェクトのみ失敗**: プロジェクト固有の問題

よろしくお願いします。
