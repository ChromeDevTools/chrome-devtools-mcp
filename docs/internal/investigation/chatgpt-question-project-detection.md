# ChatGPT質問: MCP Server Project Detection

## 状況

MCPサーバーがクライアントのプロジェクトディレクトリを検出する方法について質問したい。

## 質問文（英語）

```
## MCP Server Profile Detection Problem

I'm developing an MCP (Model Context Protocol) server that needs to create isolated Chrome profiles for each project that uses it.

**Current Problem:**
- MCP server is installed globally via npm: `chrome-ai-bridge`
- When Claude Code (MCP client) launches the server, the server's `process.cwd()` is always the MCP server's own installation directory
- We need to detect which **project directory** the MCP client is running in, not the MCP server's directory

**Current Architecture:**
```typescript
// MCP server installed at: /Users/username/projects/chrome-ai-bridge/
// But we need to detect: /Users/username/projects/my-actual-project/

function resolveProfile(opts: {
  cwd: string;  // This is MCP server's cwd, not client's project!
  env: NodeJS.ProcessEnv;
  // ...
}): ResolvedProfile {
  // How to get the actual project directory?
  const projectRoot = detectProjectRoot(opts.cwd); // ❌ Returns MCP server dir
}
```

**Question:**
How do MCP servers typically detect the **client's project directory** rather than the server's own directory?

Are there standard environment variables that MCP clients (like Claude Code, Cursor, Copilot) pass to servers? For example:
- `MCP_PROJECT_ROOT`
- `MCP_WORKSPACE_ROOT`
- Something else?

If there's no standard, what's the recommended approach for project detection in MCP servers?
```

## 補足情報

### 現在の実装

- `src/profile-resolver.ts` でプロファイルパスを決定
- `opts.cwd` を使用しているが、これはMCPサーバー自身のディレクトリ
- 結果: どのプロジェクトから起動しても `chrome-ai-bridge` という同じプロファイル名になる

### 期待する動作

- プロジェクトA: `~/.cache/chrome-ai-bridge/profiles/projectA_hash123/claude-code/stable`
- プロジェクトB: `~/.cache/chrome-ai-bridge/profiles/projectB_hash456/claude-code/stable`

### 確認済みの事実

```bash
# MCPサーバーのcwdを確認
lsof -p 84101 | grep cwd
# → /Users/usedhonda/projects/chrome-ai-bridge

# 実際のClaude Codeプロジェクト
# → /Users/usedhonda/projects/chrome-ai-bridge (同じ)
```

### 環境変数の確認が必要

MCPクライアント（Claude Code）が以下のような環境変数を渡しているか確認したい:
- `MCP_PROJECT_ROOT`
- `MCP_WORKSPACE_ROOT`
- `VSCODE_WORKSPACE_FOLDER` (VSCode拡張の場合)
- その他のMCP標準環境変数

## 日本語要約

MCPサーバーがnpmでグローバルインストールされているため、`process.cwd()` が常にMCPサーバー自身のディレクトリになってしまう問題。

実際にClaude Codeが開いているプロジェクトのディレクトリを取得する標準的な方法を知りたい。
