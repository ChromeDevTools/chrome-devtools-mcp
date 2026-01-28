# Extension Bridge デバッグ - 問題点まとめ

**作成日時**: 2026-01-28 13:20
**担当**: Claude 4.5 → Codex へ引き継ぎ

---

## 実装状況（完了済み）

- ✅ Extension Bridge実装完了（Phase 1, 2）
- ✅ `--attachTabUrl` 方式実装完了
- ✅ ビルド成功、型チェック成功
- ✅ 拡張機能インストール済み（chrome-ai-bridge Extension 1.0.0）
- ✅ `.mcp.json` 設定完了（URLベース）
  ```json
  {
    "mcpServers": {
      "chrome-ai-bridge-chatgpt": {
        "command": "node",
        "args": [
          "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
          "--attachTabUrl=https://chatgpt.com/"
        ]
      },
      "chrome-ai-bridge-gemini": {
        "command": "node",
        "args": [
          "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
          "--attachTabUrl=https://gemini.google.com/app"
        ]
      }
    }
  }
  ```
- ✅ ChatGPT, Geminiのタブが開いている
- ✅ VSCode再起動済み（Cmd+R）

---

## 🔴 問題点

### MCPサーバーが認識されていない

**症状:**
- `mcp__chrome-ai-bridge-chatgpt__*` のツールが利用不可
- `mcp__chrome-ai-bridge-gemini__*` のツールが利用不可
- MCPツール呼び出し時に `No such tool available` エラー

**期待される動作:**
- Claude Code起動時に2つのMCPサーバーが起動
- 各サーバーがRelayServerを起動（WebSocketサーバー）
- 拡張機能が自動的にタブに接続
- MCPツールが利用可能になる

---

## 🔍 未確認事項

### 1. MCPサーバーの起動状態

**確認方法:**
```bash
# MCPサーバープロセスが起動しているか
ps aux | grep "cli.mjs" | grep -v grep

# ポート確認
lsof -i -P | grep LISTEN | grep node
```

**確認すべきこと:**
- [ ] 2つのNode.jsプロセスが起動しているか（chatgpt, gemini）
- [ ] WebSocketサーバーがポートをリッスンしているか

### 2. Claude Codeのログ

**確認すべき内容:**
```
[Extension Bridge] RelayServer started on port XXXXX
[Extension Bridge] Connection URL: ws://127.0.0.1:XXXXX?token=XXXXX
```

**エラーログ:**
- MCP server initialization失敗
- RelayServer起動失敗
- 拡張機能接続タイムアウト

### 3. `.mcp.json` の読み込み

**確認ポイント:**
- プロジェクトローカルの `.mcp.json` が認識されているか
- グローバル設定（`~/.claude/config.json`）と競合していないか
- `claude mcp list` で2つのサーバーが表示されるか

### 4. 拡張機能の状態

**確認方法:**
1. 拡張機能アイコンをクリック
2. 表示される内容を確認

**期待される動作:**
- タブ一覧が表示される
- または、自動接続が実行される
- エラーメッセージがないか

---

## ✅ 追加の原因候補（要修正）

### `--attachTabUrl` と `channel` の衝突

**現状のCLI挙動:**
- `--attachTabUrl` を指定していても、`channel` が自動で `stable` に設定される
- `attachTabUrl` と `channel` は `conflicts` 指定されているため、パース時にエラーで起動失敗の可能性

**症状と一致する点:**
- MCPサーバーが起動せず、ツールが登録されない

**対策:**
- `attachTab` / `attachTabUrl` 指定時は自動 `channel` 設定を無効化する

---

## 🐛 Claudeのミス（反省点）

### 1. 拡張機能がインストールされていないと誤断言
- **問題**: 確認パスが間違っていた（専用プロファイルを見ていた）
- **実際**: ユーザーのシステムChromeにインストール済み
- **原因**: Extension Bridge方式の設計を理解していなかった

### 2. ログ確認を後回しにした
- **問題**: 最初にMCPサーバーのログを確認すべきだった
- **実際**: ユーザーに不要な確認を繰り返させた

### 3. 段階的デバッグの欠如
- **問題**: いきなりMCPツールを呼び出した
- **正しい順序**:
  1. MCPサーバープロセス確認
  2. RelayServerログ確認
  3. 拡張機能接続状態確認
  4. MCPツール呼び出しテスト

---

## ✅ 次にCodexが実施すべきこと

### 優先度1: ログとプロセス確認

```bash
# 1. MCPサーバープロセス確認
ps aux | grep "cli.mjs" | grep -v grep

# 2. Claude Codeログの場所確認
# VSCodeのOutput -> Claude Code を確認

# 3. MCP server一覧確認
claude mcp list
```

### 優先度2: 手動起動テスト

```bash
# ChatGPT用サーバーを手動起動してログ確認
node /Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs \
  --attachTabUrl=https://chatgpt.com/ 2>&1 | tee /tmp/mcp-chatgpt.log
```

**期待されるログ:**
```
[Extension Bridge] RelayServer started on port 12345
[Extension Bridge] Connection URL: ws://127.0.0.1:12345?token=xxxxx
[Extension Bridge] Waiting for Extension connection...
```

### 優先度3: 拡張機能接続テスト

1. ログに表示されたURLを確認
2. 拡張機能アイコンをクリック
3. 自動接続が実行されるか確認

### 優先度4: `.mcp.json` の認識確認

```bash
# プロジェクトルートで確認
pwd
# /Users/usedhonda/projects/mcp/chrome-ai-bridge であることを確認

cat .mcp.json
# 正しい設定が表示されることを確認
```

---

## 📋 デバッグチェックリスト

- [ ] MCPサーバープロセスが2つ起動している
- [ ] RelayServerが起動している（ログ確認）
- [ ] WebSocketサーバーがポートをリッスンしている
- [ ] 拡張機能がインストールされている（✅ 確認済み）
- [ ] ChatGPT, Geminiのタブが開いている（✅ 確認済み）
- [ ] `.mcp.json` が正しい場所にある（✅ 確認済み）
- [ ] VSCodeが `.mcp.json` を認識している
- [ ] 拡張機能が自動接続を試みている
- [ ] MCPツールが利用可能になっている

---

## 📚 参考資料

- [Extension Bridge実装プラン](../plans/cuddly-stargazing-lark.md)
- [E2Eテストガイド](./extension-bridge-test-guide.md)
- [Extension README](../src/extension/README.md)

---

---

## 💬 Codexへのメッセージ

### 謝罪

Claudeの対応が不適切で、ユーザーに無駄な手間をかけてしまいました。

**問題点:**
1. インストール済みの拡張機能を「インストールされていない」と誤って断言
2. 最初にログを確認すべきところ、ユーザーに不要な確認を繰り返させた
3. ファイルにまとめるよう指示されたのに、テキストで出力してしまった

ユーザーの時間を無駄にし、信頼を損ねました。申し訳ありませんでした。

### お願い

**上記の「次にCodexが実施すべきこと」を順番に実行し、問題を特定してください。**

特に重要なのは：
1. **MCPサーバーのログ確認** - なぜ起動していないのか、またはなぜ認識されていないのか
2. **`.mcp.json` の認識状態** - プロジェクトローカル設定が読み込まれているか
3. **拡張機能の接続状態** - 自動接続が動作しているか

よろしくお願いします。
