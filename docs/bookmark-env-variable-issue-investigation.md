# Chrome DevTools MCP - ブックマーク環境変数問題の調査

> **📌 Historical Document Notice**
>
> This document represents a past investigation from before v0.7.0. The configuration examples shown here use the **project-specific configuration approach** in `~/.claude.json`, which is now **deprecated**.
>
> **Current Recommendation (v0.7.1+):**
> - Use **global configuration** in `~/.claude.json` (root-level `mcpServers`)
> - See [MCP_SETUP.md](/MCP_SETUP.md) for current best practices
> - See [docs/mcp-configuration-guide.md](/docs/mcp-configuration-guide.md) for detailed configuration guide
>
> This document is preserved for historical reference and troubleshooting purposes.

---

## 問題の概要

Chrome DevTools MCPプロジェクトで、MCP設定でカスタムブックマークを追加したにも関わらず、デフォルトのブックマークのみが表示され、カスタムブックマークが反映されない問題が発生しています。

## 現在の症状

### 期待される動作
- MCP設定の`env.BOOKMARKS`で定義したカスタムブックマークが`list_bookmarks`で表示される
- sunoやその他のサービスへのブックマークが利用可能

### 実際の動作
- デフォルトのブックマークのみ表示（dashboard、new_item、analytics等）
- カスタムブックマークが一切表示されない
- `BOOKMARKS`環境変数が`undefined`

## 設定詳細

### ~/.claude.json の MCP設定

> **⚠️ Deprecated Configuration Format**
>
> The configuration below uses **project-specific** configuration format, which is now deprecated. This was the format used at the time of this investigation.
>
> **For current configuration**, use **global configuration** format:
> ```json
> {
>   "mcpServers": {
>     "chrome-devtools-extension": {
>       "command": "npx",
>       "args": ["chrome-devtools-mcp-for-extension@latest"]
>     }
>   }
> }
> ```
> See [MCP_SETUP.md](/MCP_SETUP.md) for details.

**Historical configuration (deprecated):**
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/chrome-devtools-mcp/build/src/main.js",
        "--loadExtensionsDir",
        "/Users/usedhonda/projects/Chrome-Extension",
        "--userDataDir",
        "/Users/usedhonda/chrome-mcp-profile"
      ],
      "env": {
        "BOOKMARKS": "{\"dashboard\":\"https://chrome.google.com/webstore/devconsole\",\"new_item\":\"https://chrome.google.com/webstore/devconsole/register\",\"analytics\":\"https://chrome.google.com/webstore/devconsole/analytics\",\"payments\":\"https://chrome.google.com/webstore/devconsole/payments\",\"support\":\"https://support.google.com/chrome_webstore/contact/developer_support\",\"extensions\":\"chrome://extensions/\",\"extensions_dev\":\"chrome://extensions/?id=\",\"policy\":\"https://developer.chrome.com/docs/webstore/program-policies/\",\"docs\":\"https://developer.chrome.com/docs/extensions/\",\"localhost\":\"http://localhost:3000\",\"localhost8080\":\"http://localhost:8080\"}"
      }
    }
  }
}
```

### コード実装 (src/tools/bookmarks.ts)
```typescript
function getBookmarks(): Record<string, string> {
  const bookmarksEnv = process.env.BOOKMARKS;
  if (!bookmarksEnv) {
    return {};
  }

  try {
    return JSON.parse(bookmarksEnv);
  } catch (error) {
    console.warn('Failed to parse BOOKMARKS environment variable:', error);
    return {};
  }
}
```

## 調査結果

### 環境変数の確認
```bash
# MCPサーバープロセス内での確認
$ node -e "console.log('BOOKMARKS env:', process.env.BOOKMARKS)"
BOOKMARKS env: undefined

# シェル環境での確認
$ echo $BOOKMARKS
# 空白（設定されていない）
```

### 現在表示されるブックマーク
```
📚 Available Bookmarks:
• dashboard: https://chrome.google.com/webstore/devconsole
• new_item: https://chrome.google.com/webstore/devconsole/register
• analytics: https://chrome.google.com/webstore/devconsole/analytics
• payments: https://chrome.google.com/webstore/devconsole/payments
• support: https://support.google.com/chrome_webstore/contact/developer_support
• extensions: chrome://extensions/
• extensions_dev: chrome://extensions/?id=
• policy: https://developer.chrome.com/docs/webstore/program-policies/
• docs: https://developer.chrome.com/docs/extensions/
• localhost: http://localhost:3000
• localhost8080: http://localhost:8080
```

## 推定原因

1. **MCP環境変数の伝達問題**: Claude Codeが`~/.claude.json`の`env`セクションをMCPサーバープロセスに正しく渡していない可能性
2. **JSON エスケープ問題**: 複雑にエスケープされたJSONが正しく解析されていない可能性
3. **デフォルトブックマークの上書き**: カスタムブックマークではなくハードコードされたデフォルト値が使用されている可能性

## 技術環境

- **OS**: macOS 26.0
- **Claude Code**: 最新版
- **Node.js**: v22.12.0+
- **MCP SDK**: @modelcontextprotocol/sdk
- **プロジェクト**: Chrome DevTools MCP (拡張機能対応フォーク版)

## デバッグで確認したい事項

1. **環境変数の伝達メカニズム**: Claude CodeがMCPサーバーに環境変数をどう渡すか
2. **JSONパース処理**: エスケープされたJSON文字列の正しい処理方法
3. **デフォルトブックマークの実装**: ハードコードされたブックマークとカスタムブックマークの関係
4. **MCP設定の有効範囲**: ユーザー設定 vs プロジェクト設定での環境変数の扱い

## 解決したい結果

- MCP設定の`BOOKMARKS`環境変数が正しくMCPサーバープロセスに伝達される
- カスタムブックマークが`list_bookmarks`で表示される
- `navigate_bookmark`でカスタムブックマークが利用可能になる

## 参考情報

### Claude Code MCP設定ドキュメント
- https://docs.claude.com/en/docs/claude-code/mcp

### 関連ファイル
- `/Users/usedhonda/.claude.json` - MCP設定
- `src/tools/bookmarks.ts` - ブックマーク実装
- `src/tools/ToolDefinition.js` - ツール定義フレームワーク

## 質問

1. Claude CodeのMCP環境変数伝達メカニズムの正しい設定方法は？
2. JSONエスケープされた文字列の正しい設定フォーマットは？
3. ハードコードされたデフォルトブックマークとカスタムブックマークの統合方法は？
4. デバッグのための環境変数確認方法は？