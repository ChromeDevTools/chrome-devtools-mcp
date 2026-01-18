# Chrome DevTools MCP for Extension Development

[![npm chrome-devtools-mcp-for-extension package](https://img.shields.io/npm/v/chrome-devtools-mcp-for-extension.svg)](https://npmjs.org/package/chrome-devtools-mcp-for-extension)

> AI-powered Chrome extension development via MCP

Built for: Claude Code, Cursor, VS Code Copilot, Cline, and other MCP-compatible AI tools

---

## Quick Start (5 minutes)

### 1. Run the server

```bash
npx chrome-devtools-mcp-for-extension@latest
```

### 2. Configure your MCP client

**For Claude Code** (`~/.claude.json`):

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

### 3. Verify it works

Restart your AI client and ask: `"List all my Chrome extensions"`

### Load development extensions (optional)

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--loadExtensionsDir=/path/to/your/extensions"
      ]
    }
  }
}
```

---

## What You Can Do

- **Extension Development**: Load, debug, and hot-reload Chrome extensions
- **Browser Automation**: Navigate, click, fill forms, take screenshots
- **Performance Analysis**: Trace recording and insight extraction
- **AI Research**: Automated ChatGPT/Gemini interactions
- **Web Store Submission**: Automated screenshot generation and submission

---

## Tools Reference

### Core Tools (18)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `take_snapshot` | Get page structure with element UIDs | - |
| `take_screenshot` | Capture page or element image | `fullPage`, `uid` |
| `click` | Click element by UID | `uid`, `dblClick` |
| `fill` | Fill input/textarea/select | `uid`, `value` |
| `fill_form` | Fill multiple form elements | `elements[]` |
| `hover` | Hover over element | `uid` |
| `drag` | Drag element to another | `from_uid`, `to_uid` |
| `upload_file` | Upload file through input | `uid`, `filePath` |
| `navigate` | Go to URL, back, forward | `op`, `url` |
| `pages` | List, select, close tabs | `op`, `pageIdx` |
| `wait_for` | Wait for text to appear | `text`, `timeout` |
| `handle_dialog` | Accept/dismiss dialogs | `action` |
| `resize_page` | Change viewport size | `width`, `height` |
| `emulate` | CPU/network throttling | `target`, `throttlingRate` |
| `network` | List/get network requests | `op`, `url` |
| `performance` | Start/stop/analyze traces | `op`, `insightName` |
| `evaluate_script` | Run JavaScript in page | `function` |
| `list_console_messages` | Get console output | - |

### Optional Tools (2) - Web-LLM

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ask_chatgpt_web` | Ask ChatGPT via browser | `question`, `createNewChat` |
| `ask_gemini_web` | Ask Gemini via browser | `question`, `createNewChat` |

**Full documentation:** [docs/reference/tools.md](docs/reference/tools.md)

---

## Plugin Architecture (v0.26.0)

### Disable Web-LLM tools

```json
{
  "env": {
    "MCP_DISABLE_WEB_LLM": "true"
  }
}
```

### Load external plugins

```json
{
  "env": {
    "MCP_PLUGINS": "./my-plugin.js,@org/another-plugin"
  }
}
```

**Plugin interface:**

```typescript
export default {
  id: 'my-plugin',
  name: 'My Custom Plugin',
  version: '1.0.0',
  async register(ctx) {
    ctx.registry.register({
      name: 'my_tool',
      description: 'Does something useful',
      schema: { /* zod schema */ },
      async handler(input, response, context) { /* implementation */ },
    });
  },
};
```

---

## For Developers

### Local development setup

```bash
git clone https://github.com/usedhonda/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm install && npm run build
```

Configure `~/.claude.json` to use local version:

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-devtools-mcp/scripts/cli.mjs"]
    }
  }
}
```

### Hot-reload development

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-devtools-mcp/scripts/mcp-wrapper.mjs"],
      "cwd": "/absolute/path/to/chrome-devtools-mcp",
      "env": { "MCP_ENV": "development" }
    }
  }
}
```

**Benefits:** Auto-rebuild on file changes, 2-5 second feedback loop.

**See also:** [docs/dev/hot-reload.md](docs/dev/hot-reload.md)

### Commands

```bash
npm run build      # Build TypeScript
npm run typecheck  # Type check
npm test           # Run tests
npm run format     # Format code
```

### Project structure

```
chrome-devtools-mcp/
├── src/
│   ├── tools/           # MCP tool definitions
│   ├── plugin-api.ts    # Plugin architecture
│   ├── browser.ts       # Browser management
│   └── main.ts          # Entry point
├── scripts/
│   ├── cli.mjs          # Production entry
│   └── mcp-wrapper.mjs  # Development wrapper
└── docs/                # Documentation
```

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Setup Guide](docs/user/setup.md) | Detailed MCP configuration |
| [Workflows](docs/user/workflows.md) | Common usage patterns |
| [Troubleshooting](docs/user/troubleshooting.md) | Problem solving |
| [Tools Reference](docs/reference/tools.md) | Full tool documentation |
| [Hot-Reload Setup](docs/dev/hot-reload.md) | Developer workflow |

---

## Troubleshooting

### Extension not loading
- Verify `manifest.json` is at extension root
- Use absolute paths in `--loadExtensionsDir`

### MCP server issues
```bash
npx clear-npx-cache && npx chrome-devtools-mcp-for-extension@latest
```

**More:** [docs/user/troubleshooting.md](docs/user/troubleshooting.md)

---

## Credits

Fork of [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) by Google LLC.

**Additions:** Extension development tools, Web Store automation, ChatGPT/Gemini integration, hot-reload workflow.

---

## License

Apache-2.0

**Version**: 0.26.1
**Repository**: https://github.com/usedhonda/chrome-devtools-mcp
