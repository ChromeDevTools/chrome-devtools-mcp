# tmux で .mcp.json を確実に起動する方法

VSCode / Claude Code が `.mcp.json` を拾わない場合でも、
このリポジトリ側で **確実にMCPサーバーを立ち上げる**ための手順です。

## 使い方

```bash
cd /Users/usedhonda/projects/mcp/chrome-ai-bridge
node scripts/start-mcp-from-json.mjs
```

`.mcp.json` を別パスで指定する場合:

```bash
node scripts/start-mcp-from-json.mjs /path/to/.mcp.json
```

## 何が起きるか

- `.mcp.json` の `mcpServers` を読み取り
- 各サーバーを **別プロセス**で起動
- それぞれの標準出力/標準エラーを `[server-name]` でプレフィックスして表示

## 目的

Claude Code / MCP クライアントが `.mcp.json` を認識しない場合の
**ワークアラウンド**として使います。

## 停止方法

- `Ctrl+C` で全プロセスを停止します。

