# chrome-ai-bridge

[![npm](https://img.shields.io/npm/v/chrome-ai-bridge.svg)](https://npmjs.org/package/chrome-ai-bridge)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> Bridge between AI and Chrome Browser

MCP server enabling AI assistants to control Chrome, consult other AIs, and develop extensions.

**Compatible with:** Claude Code, Cursor, VS Code Copilot, Cline, and other MCP clients

---

## What is this?

chrome-ai-bridge is a [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI assistants:

- **Eyes**: See what's on web pages (screenshots, DOM snapshots)
- **Hands**: Interact with pages (click, type, navigate)
- **Voice**: Consult other AIs (ChatGPT, Gemini) via browser

Think of it as the bridge that connects your AI coding assistant to the browser world.

---

## Quick Start

### 1. Run the server

```bash
npx chrome-ai-bridge@latest
```

### 2. Configure your MCP client

**For Claude Code** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": ["chrome-ai-bridge@latest"]
    }
  }
}
```

### 3. Verify it works

Restart your AI client and try: `"Take a screenshot of google.com"`

---

## Key Features

### Multi-AI Consultation

Ask ChatGPT or Gemini questions directly from your AI assistant:

```
"Ask ChatGPT how to implement OAuth in Node.js"
"Ask Gemini to review this architecture decision"
```

| Feature | Description |
|---------|-------------|
| **Session persistence** | Conversations continue across tool calls |
| **Auto-logging** | All Q&A saved to `docs/ask/chatgpt/` and `docs/ask/gemini/` |
| **12 languages** | Login detection works in EN, JA, FR, DE, ES, IT, KO, ZH, PT, RU, AR |

### Browser Automation

Full browser control with 20+ tools:

| Category | Tools |
|----------|-------|
| **Snapshot** | `take_snapshot`, `take_screenshot` |
| **Input** | `click`, `fill`, `fill_form`, `hover`, `drag`, `upload_file` |
| **Navigation** | `navigate`, `pages`, `wait_for`, `handle_dialog` |
| **Inspection** | `network`, `list_console_messages`, `evaluate_script` |
| **Performance** | `performance` (start/stop/analyze traces) |
| **Emulation** | `emulate` (CPU/network throttling), `resize_page` |

### Chrome Extension Development

Build and debug Chrome extensions with AI assistance:

```json
{
  "args": ["chrome-ai-bridge@latest", "--loadExtensionsDir=/path/to/extensions"]
}
```

| Tool | Description |
|------|-------------|
| `extension_popup` | Open/close extension popups |
| `iframe_popup` | Inspect, patch, reload iframe-embedded popups |
| `bookmarks` | Quick access to chrome://extensions, Web Store dashboard |

### Plugin Architecture

Extend with custom tools:

```json
{
  "env": {
    "MCP_PLUGINS": "./my-plugin.js,@org/another-plugin"
  }
}
```

```typescript
// my-plugin.js
export default {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  async register(ctx) {
    ctx.registry.register({
      name: 'my_tool',
      description: 'Does something useful',
      schema: { /* zod schema */ },
      async handler(input, response, context) { /* ... */ },
    });
  },
};
```

---

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MCP_DISABLE_WEB_LLM` | Set `true` to disable ChatGPT/Gemini tools |
| `MCP_PLUGINS` | Comma-separated list of plugin paths |
| `MCP_ENV` | Set `development` for hot-reload mode |

### CLI Options

| Option | Description |
|--------|-------------|
| `--loadExtensionsDir` | Load Chrome extensions from directory |
| `--headless` | Run in headless mode |
| `--channel` | Chrome channel (stable/canary) |

---

## Tools Reference

### Core Tools (18)

| Tool | Description |
|------|-------------|
| `take_snapshot` | Get page structure with element UIDs |
| `take_screenshot` | Capture page or element image |
| `click` | Click element by UID |
| `fill` | Fill input/textarea/select |
| `fill_form` | Fill multiple form elements |
| `hover` | Hover over element |
| `drag` | Drag element to another |
| `upload_file` | Upload file through input |
| `navigate` | Go to URL, back, forward |
| `pages` | List, select, close tabs |
| `wait_for` | Wait for text to appear |
| `handle_dialog` | Accept/dismiss dialogs |
| `resize_page` | Change viewport size |
| `emulate` | CPU/network throttling |
| `network` | List/get network requests |
| `performance` | Start/stop/analyze traces |
| `evaluate_script` | Run JavaScript in page |
| `list_console_messages` | Get console output |

### Web-LLM Tools (2)

| Tool | Description |
|------|-------------|
| `ask_chatgpt_web` | Ask ChatGPT via browser |
| `ask_gemini_web` | Ask Gemini via browser |

**Full documentation:** [docs/reference/tools.md](docs/reference/tools.md)

---

## For Developers

### Local Development

```bash
git clone https://github.com/usedhonda/chrome-ai-bridge.git
cd chrome-ai-bridge
npm install && npm run build
```

Configure `~/.claude.json`:

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["/path/to/chrome-ai-bridge/scripts/cli.mjs"]
    }
  }
}
```

### Hot-Reload Development

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["/path/to/chrome-ai-bridge/scripts/mcp-wrapper.mjs"],
      "cwd": "/path/to/chrome-ai-bridge",
      "env": { "MCP_ENV": "development" }
    }
  }
}
```

Auto-rebuild on file changes with 2-5 second feedback loop.

### Commands

```bash
npm run build      # Build TypeScript
npm run typecheck  # Type check
npm test           # Run tests
npm run format     # Format code
```

### Project Structure

```
chrome-ai-bridge/
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

### MCP server not responding

```bash
npx clear-npx-cache && npx chrome-ai-bridge@latest
```

### Extension not loading

- Verify `manifest.json` exists at extension root
- Use absolute paths in `--loadExtensionsDir`

### ChatGPT/Gemini login issues

- Check browser window for login prompts
- Login detection supports 12 languages

**More:** [docs/user/troubleshooting.md](docs/user/troubleshooting.md)

---

## Credits

Built on [Chrome DevTools MCP](https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-devtools) by Google LLC, with extensions for multi-AI consultation and Chrome extension development.

---

## License

Apache-2.0
