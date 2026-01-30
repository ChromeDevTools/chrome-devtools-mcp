# How to contribute

We'd love to accept your patches and contributions to this project.

This is a fork of [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-ai-bridge) by Google, focused on multi-AI consultation (ChatGPT/Gemini) via Chrome extension.

## Before you begin

### Project Focus

This fork focuses on:
- **Multi-AI consultation**: Querying ChatGPT and Gemini through browser automation
- **Chrome extension communication**: CDP-based communication via WebSocket
- **Debugging tools**: Page state inspection and DOM queries

When contributing:
- Ensure changes align with the extension-based architecture (no Puppeteer)
- New features should enhance AI consultation or debugging capabilities
- Follow the same coding standards as the original project

## Contribution process

### Code reviews

All submissions, including submissions by project members, require review. We use GitHub pull requests for this purpose. Consult [GitHub Help](https://help.github.com/articles/about-pull-requests/) for more information on using pull requests.

### Conventional commits

Please follow [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for PR and commit titles.

## Development Setup

### Prerequisites

1. **Chrome Extension**: Must be installed and enabled
2. **ChatGPT/Gemini accounts**: Must be logged in for testing

### Installation

```bash
git clone https://github.com/anthropics/anthropic-quickstarts.git
cd anthropic-quickstarts/mcp-devtools
npm ci
npm run build
```

### Install Chrome Extension

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select `build/extension/`
4. Verify the extension icon appears in your toolbar

### Testing with @modelcontextprotocol/inspector

```bash
npx @modelcontextprotocol/inspector node scripts/cli.mjs
```

### Testing with an MCP client

Add the MCP server to your global MCP configuration at `~/.claude.json`:

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-ai-bridge/scripts/cli.mjs"]
    }
  }
}
```

**Note:** This uses the local build for development. For end-users, the configuration would use `npx` with the published package instead.

### Testing Tools

```bash
# Test ChatGPT connection
npm run test:chatgpt -- "TypeScript generics explanation"

# Test Gemini connection
npm run test:gemini -- "Python async file reading"

# Test both AIs
npm run test:both

# CDP snapshot for debugging
npm run cdp:chatgpt
npm run cdp:gemini
```

## Project Structure

```
chrome-ai-bridge/
├── src/
│   ├── fast-cdp/         # CDP client and AI chat logic
│   │   ├── fast-chat.ts  # ChatGPT/Gemini automation
│   │   ├── cdp-client.ts # CDP command client
│   │   └── extension-raw.ts # Extension connection
│   ├── extension/        # Chrome extension source
│   │   ├── background.mjs    # Service worker
│   │   ├── relay-server.ts   # Discovery/Relay servers
│   │   └── manifest.json
│   ├── main.ts           # MCP server entry point
│   └── index.ts          # Main exports
├── scripts/
│   └── cli.mjs           # CLI entry point
└── docs/
    └── SPEC.md           # Technical specification
```

## Debugging

To enable debug logging, set the `DEBUG` environment variable:

```bash
DEBUG=mcp:* node scripts/cli.mjs
```

Debug logs are written to `.local/chrome-ai-bridge/debug/` when errors occur.

### VS Code SSH

When running the `@modelcontextprotocol/inspector`, it spawns 2 services - one on port `6274` and one on `6277`. Usually VS Code automatically detects and forwards `6274` but fails to detect `6277`, so you need to manually forward it.

## Build Commands

```bash
npm run build      # Build TypeScript
npm run typecheck  # Type check only
npm test           # Run tests
npm run format     # Format code with Prettier
```

## Documentation

When adding a new tool or updating tool descriptions, ensure:
1. The tool is documented in `docs/SPEC.md`
2. README.md tool reference is updated if applicable
