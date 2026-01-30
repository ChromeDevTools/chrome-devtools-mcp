# MCP Streamable HTTP 対応（Codex向け）

このプロジェクトは **stdio に加えて Streamable HTTP** でも起動できるようになりました。
Claude Code は従来どおり stdio を使用し、Codex など HTTP クライアントからは
`http://127.0.0.1:<port>/mcp` を利用できます。

## 起動方法（tmux向け・自動ポート割当）

`start-mcp-from-json` は各サーバーに HTTP ポートを自動割当します。

```bash
cd /Users/usedhonda/projects/mcp/chrome-ai-bridge
node scripts/start-mcp-from-json.mjs
```

起動時に **Codex CLI の設定ファイル**（`~/.codex/config.toml`）を自動更新し、
HTTP endpoint を登録します。
無効化したい場合は以下のように `MCP_HTTP_PORT_BASE=0` を指定してください。

```bash
MCP_HTTP_PORT_BASE=0 node scripts/start-mcp-from-json.mjs
```

Codex CLI を **stdio で自動起動**させたい場合は、以下を一度だけ実行してください：

```bash
node scripts/configure-codex-mcp.mjs
```

HTTP 設定に戻したい場合：

```bash
node scripts/configure-codex-mcp.mjs --http 8765
```

割り当て規則:
- 既定ベースポート: `8765`
- 1つ目のサーバー: `8765`
- 2つ目のサーバー: `8766`
- ...

必要なら基準を変更:

```bash
MCP_HTTP_PORT_BASE=9000 node scripts/start-mcp-from-json.mjs
```

## HTTP 有効化の条件

サーバーは **`MCP_HTTP_PORT` が設定されているときのみ** HTTP を有効化します。
`start-mcp-from-json.mjs` が自動設定します。

## 接続先 URL

- `http://127.0.0.1:8765/mcp`
- `http://127.0.0.1:8766/mcp`

## 仕様

- MCP Streamable HTTP（SDK 標準）
- POST/GET/DELETE を `/mcp` で処理
- CORS あり（ローカル想定）
