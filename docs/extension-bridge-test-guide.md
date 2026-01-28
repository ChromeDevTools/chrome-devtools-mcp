# Extension Bridge E2Eテストガイド

## テスト環境セットアップ

### 1. 拡張機能のインストール

1. Chrome で `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化（右上のトグル）
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `/Users/usedhonda/projects/mcp/chrome-ai-bridge/build/extension/` ディレクトリを選択

### 2. テスト用Chromeタブの準備

以下のタブを開いてください：

- **Tab 101**: https://chatgpt.com
- **Tab 102**: https://gemini.google.com

**タブIDの確認方法:**
1. `chrome://inspect/#pages` を開く
2. 各タブの「inspect」リンクのURLにタブIDが含まれる
   - 例: `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:9222/devtools/page/101`

**注意**: タブIDは動的に割り当てられるため、上記の101/102と異なる場合があります。実際のタブIDを `.mcp.json` に反映してください。

### 3. MCPサーバー設定の更新

`.mcp.json` を実際のタブIDで更新:

```json
{
  "mcpServers": {
    "chrome-ai-bridge-chatgpt": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTab=<実際のChatGPTタブID>"
      ]
    },
    "chrome-ai-bridge-gemini": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs",
        "--attachTab=<実際のGeminiタブID>"
      ]
    }
  }
}
```

### 4. Claude Code起動

```bash
cd /Users/usedhonda/projects/mcp/chrome-ai-bridge
claude
```

**期待されるログ:**
```
[Extension Bridge] RelayServer started on port 12345
[Extension Bridge] Connection URL: ws://127.0.0.1:12345?token=xxxxx
```

## テストシナリオ

### シナリオ1: 単一タブ接続テスト

**目的**: chrome-ai-bridge-chatgptプロセスがChatGPTタブに正常に接続できることを確認

**手順:**

1. 拡張機能のアイコンをクリック
2. 表示されるURLをコピー（`ws://127.0.0.1:12345?token=xxxxx`）
3. ChatGPTのタブを選択
4. 接続UIでタブを選択し「Connect to Selected Tab」をクリック

**検証項目:**
- ✅ WebSocket接続が成功する
- ✅ Claude Codeで `take_snapshot` が実行できる
- ✅ DOMツリーが取得できる
- ✅ `click`, `fill` などの操作が動作する

**テストコマンド:**
```
Claude Code内で:
> mcp__chrome-ai-bridge-chatgpt__take_snapshot
```

### シナリオ2: 複数タブ同時操作テスト

**目的**: 2つのMCPプロセスが独立して動作することを確認

**手順:**

1. ChatGPTタブで拡張機能を接続（シナリオ1と同様）
2. Geminiタブでも同様に接続
3. 両方のタブで並行してMCPツールを実行

**検証項目:**
- ✅ 2つのRelayServerが異なるポートで起動する
- ✅ 各プロセスが独立したタブに接続する
- ✅ 操作が互いに干渉しない

**テストコマンド:**
```
Claude Code内で:
> mcp__chrome-ai-bridge-chatgpt__take_snapshot
> mcp__chrome-ai-bridge-gemini__take_snapshot
```

### シナリオ3: サブエージェント同時実行テスト

**目的**: メインエージェント（Claude）が2つのサブエージェントを並列起動し、ChatGPTとGeminiに同時に質問を投げられることを確認

**手順:**

1. Claude Codeで以下のタスクを実行:
   ```
   ChatGPTとGeminiに並行して「TypeScriptのジェネリクスの使い方」を質問してください
   ```

2. 期待される動作:
   - Claude が2つのサブエージェントを起動
   - 各サブエージェントが対応するMCPサーバーを使用
   - ChatGPTとGeminiで並行して質問が送信される
   - 両方の回答を統合してレポート

**検証項目:**
- ✅ 複数プロセス方式で並行処理が動作する
- ✅ 各タブの操作が独立している
- ✅ 結果の統合が正しく行われる

## トラブルシューティング

### 問題: 拡張機能が接続できない

**原因:**
- RelayServerが起動していない
- ポート番号が間違っている
- トークンが一致していない

**解決方法:**
1. Claude Codeのログで実際のURLとトークンを確認
2. 接続UIに正しいURLを入力

### 問題: タブIDが見つからない

**原因:**
- 指定したタブIDのタブが存在しない
- タブIDが変わった（Chrome再起動後など）

**解決方法:**
1. `chrome://inspect/#pages` でタブIDを再確認
2. `.mcp.json` を更新
3. Claude Codeを再起動

### 問題: MCPツールが動作しない

**原因:**
- CDP接続が失敗している
- Puppeteerの互換性問題

**解決方法:**
1. Chrome DevToolsのコンソールでエラーを確認
2. 拡張機能のService Workerログを確認
3. RelayServerのログを確認

## テスト完了の確認事項

- [ ] 拡張機能がChromeにインストールされている
- [ ] ChatGPTとGeminiのタブが開いている
- [ ] 実際のタブIDを `.mcp.json` に設定している
- [ ] Claude Codeが起動し、RelayServerが動作している
- [ ] 単一タブ接続テストが成功している
- [ ] 複数タブ同時操作テストが成功している
- [ ] サブエージェント同時実行テストが成功している

## 次のステップ

E2Eテストが成功したら、以下を実施:

1. Phase 3（既存コード削除）の実装
2. ドキュメントの更新
3. mainブランチへのマージ
4. リリース準備

## 参考資料

- [Extension Bridge設計書](./dedicated-profile-design.md)
- [Extension README](../src/extension/README.md)
- [実装プラン](../plans/cuddly-stargazing-lark.md)
