# chrome-ai-bridge

[![npm](https://img.shields.io/npm/v/chrome-ai-bridge.svg)](https://npmjs.org/package/chrome-ai-bridge)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> Bridge between AI coding assistants and ChatGPT/Gemini via Chrome Extension

MCP server that enables AI assistants to consult ChatGPT and Gemini through a Chrome extension.

**Compatible with:** Claude Code, Cursor, VS Code Copilot, Cline, and other MCP clients

---

## What is this?

chrome-ai-bridge is a [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI assistants the ability to:

- **Consult other AIs**: Ask ChatGPT and Gemini questions via browser
- **Get multiple perspectives**: Query both AIs in parallel for second opinions
- **Debug connections**: Inspect page state via CDP snapshots

> **v2.0.0 Breaking Change**: This version uses a Chrome extension for browser communication instead of Puppeteer. Previous CLI options (`--headless`, `--loadExtensionsDir`, etc.) are no longer supported.

---

## Quick Start

### 1. Install the Chrome Extension

1. Download the latest release from [Releases](https://github.com/anthropics/anthropic-quickstarts/releases)
2. Or build from source:
   ```bash
   git clone https://github.com/anthropics/anthropic-quickstarts.git
   cd anthropic-quickstarts/mcp-devtools
   npm install && npm run build
   ```
3. Open `chrome://extensions/` in Chrome
4. Enable "Developer mode"
5. Click "Load unpacked" and select `build/extension/`

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

### 3. Connect the Extension

1. Open ChatGPT (https://chatgpt.com) or Gemini (https://gemini.google.com) in Chrome
2. Log in to both services
3. The extension will automatically connect when the MCP server starts

### 4. Verify it works

Restart your AI client and try: `"Ask ChatGPT how to implement OAuth in Node.js"`

---

## Features

### Multi-AI Consultation

Ask ChatGPT or Gemini questions directly from your AI assistant:

```
"Ask ChatGPT how to implement OAuth in Node.js"
"Ask Gemini to review this architecture decision"
"Ask both AIs for their opinions on this approach"
```

| Feature | Description |
|---------|-------------|
| **Parallel queries** | Ask both AIs simultaneously with `ask_chatgpt_gemini_web` |
| **Session persistence** | Conversations continue across tool calls |
| **Auto-logging** | All Q&A saved to `.local/chrome-ai-bridge/history.jsonl` |

### Debugging Tools

Inspect the connection state and page content:

| Tool | Description |
|------|-------------|
| `take_cdp_snapshot` | Get page state (URL, title, input/button status) |
| `get_page_dom` | Query DOM elements with CSS selectors |

---

## Tools Reference

### Available Tools (5)

| Tool | Description |
|------|-------------|
| `ask_chatgpt_web` | Ask ChatGPT via browser |
| `ask_gemini_web` | Ask Gemini via browser |
| `ask_chatgpt_gemini_web` | Ask both AIs in parallel (recommended) |
| `take_cdp_snapshot` | Debug: Get CDP page state |
| `get_page_dom` | Debug: Query DOM elements |

### Recommended Usage

For general queries, use `ask_chatgpt_gemini_web` to get multiple perspectives:

```
User: "Ask AI about React best practices"
→ Claude uses ask_chatgpt_gemini_web (queries both in parallel)
```

Only use individual tools when explicitly requested:

```
User: "Ask ChatGPT specifically about this"
→ Claude uses ask_chatgpt_web
```

---

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MCP_DISABLE_WEB_LLM` | Set `true` to disable ChatGPT/Gemini tools |

---

## For Developers

### Local Development

```bash
git clone https://github.com/anthropics/anthropic-quickstarts.git
cd anthropic-quickstarts/mcp-devtools
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
│   ├── fast-cdp/        # CDP client and AI chat logic
│   ├── extension/       # Chrome extension source
│   ├── main.ts          # MCP server entry point
│   └── index.ts         # Main exports
├── scripts/
│   └── cli.mjs          # CLI entry point
└── docs/                # Documentation
```

### Testing

```bash
# Test ChatGPT connection
npm run test:chatgpt -- "TypeScript generics explanation"

# Test Gemini connection
npm run test:gemini -- "Python async file reading"

# Test both
npm run test:both

# CDP snapshot for debugging
npm run cdp:chatgpt
npm run cdp:gemini
```

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Technical Spec](docs/SPEC.md) | Detailed architecture and implementation |
| [Setup Guide](docs/user/setup.md) | Detailed MCP configuration |
| [Troubleshooting](docs/user/troubleshooting.md) | Problem solving |
| [Extension Bridge Design](docs/internal/design/extension-bridge.md) | Extension architecture |

---

## Troubleshooting

### Extension not connecting

1. Check that the extension is installed and enabled in `chrome://extensions/`
2. Verify ChatGPT/Gemini tabs are open and logged in
3. Check the extension popup for connection status

### MCP server not responding

```bash
npx clear-npx-cache && npx chrome-ai-bridge@latest
```

### ChatGPT/Gemini not responding

- Ensure you're logged in to both services
- Try refreshing the ChatGPT/Gemini tab
- Check for rate limiting or service issues

**More:** [docs/user/troubleshooting.md](docs/user/troubleshooting.md)

---

## Architecture (v2.0.0)

```
┌─────────────────┐         MCP         ┌──────────────────┐
│  Claude Code    │ ◀──────────────────▶│   MCP Server     │
│  (MCP Client)   │                     │  (Node.js)       │
└─────────────────┘                     └────────┬─────────┘
                                                 │
                                                 ▼
                                      ┌──────────────────┐
                                      │ Chrome Extension │
                                      │ (CDP via WebSocket)│
                                      └────────┬─────────┘
                                               │
                               ┌───────────────┴───────────────┐
                               ▼                               ▼
                    ┌─────────────────┐             ┌─────────────────┐
                    │  ChatGPT Tab    │             │  Gemini Tab     │
                    └─────────────────┘             └─────────────────┘
```

---

## Credits

Originally forked from [Chrome DevTools MCP](https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-devtools) by Google LLC. This fork focuses on multi-AI consultation capabilities via Chrome extension.

---

## License

Apache-2.0
