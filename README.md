# Chrome DevTools MCP for Extension Development

[![npm chrome-devtools-mcp-for-extension package](https://img.shields.io/npm/v/chrome-devtools-mcp-for-extension.svg)](https://npmjs.org/package/chrome-devtools-mcp-for-extension)

An MCP server for Chrome extension development and automation.

Based on [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) by Google.

## Quick Start

Add this configuration to your MCP client:

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  }
}
```

**Claude Code users:**

```bash
claude mcp add chrome-devtools-extension npx chrome-devtools-mcp-for-extension@latest
```

<details>
<summary>Configuration file locations</summary>

**Configuration file locations:**

- **Cursor**: `~/.cursor/extensions_config.json`
- **VS Code Copilot**: `.vscode/settings.json`
- **Cline**: Follow Cline's MCP setup guide

**JSON configuration:**
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  }
}
```

**With extension loading:**
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--loadExtension=/path/to/your/extension"
      ]
    }
  }
}
```
</details>

### 2. Restart Claude Code

### 3. Try your first command

Try: "List all my Chrome extensions"

## Features

- **Extension Development**: Load, debug, and reload Chrome extensions
- **Web Store Automation**: Automated submission with screenshots
- **Browser Control**: Navigate, click, fill forms, take screenshots
- **Performance Analysis**: Chrome DevTools integration
- **Network Debugging**: Request monitoring and analysis

---

# 日本語 / Japanese

**Chrome 拡張機能開発用の MCP サーバー**

## クイックスタート

MCP クライアントに設定を追加：

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  }
}
```

## 機能

- **拡張機能開発**: ロード、デバッグ、リロード
- **Web Store 自動申請**: スクリーンショット生成付き
- **ブラウザ制御**: ナビゲーション、フォーム操作、スクリーンショット
- **パフォーマンス分析**: Chrome DevTools 統合

## Use Cases

```
"Create a Chrome extension that blocks ads"
"Debug why my content script isn't working"
"Submit my extension to Chrome Web Store"
"Generate screenshots for store listing"
```

## 使用例

```
"広告ブロック拡張機能を作成して"
"コンテンツスクリプトが動かない原因をデバッグして"
"Web Store に拡張機能を申請して"
```