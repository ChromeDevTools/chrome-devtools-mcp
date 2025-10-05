# Chrome DevTools MCP for Extension Development

[![npm chrome-devtools-mcp-for-extension package](https://img.shields.io/npm/v/chrome-devtools-mcp-for-extension.svg)](https://npmjs.org/package/chrome-devtools-mcp-for-extension)

**AI-powered Chrome extension development with automated testing, debugging, and Web Store submission**

Built for: Claude Code, Cursor, VS Code Copilot, Cline, and other MCP-compatible AI tools

---

## 📦 For Users: Quick Start

### Installation

**Option 1: Direct execution (recommended)**
```bash
npx chrome-devtools-mcp-for-extension@latest
```

**Option 2: Global installation**
```bash
npm install -g chrome-devtools-mcp-for-extension
chrome-devtools-mcp-for-extension
```

### MCP Configuration

Add to your MCP client configuration file:

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

**For other MCP clients** (Cursor, VS Code Copilot, Cline):
- Refer to your client's MCP configuration documentation
- Use the same `command` and `args` as above

### Test It

1. Restart your AI client
2. Ask: `"List all my Chrome extensions"`
3. ✅ You should see your installed Chrome extensions

### Load Development Extensions (Optional)

To test your own extensions under development:

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

**Directory structure:**
```
/path/to/your/extensions/
├── extension-1/
│   └── manifest.json
├── extension-2/
│   └── manifest.json
```

---

## 👨‍💻 For Developers: Contributing

### Local Development Setup

**1. Clone and install:**
```bash
git clone https://github.com/usedhonda/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm install
npm run build
```

**2. Configure MCP client to use local version:**

Update `~/.claude.json`:
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "node",
      "args": [
        "/absolute/path/to/chrome-devtools-mcp/scripts/cli.mjs",
        "--loadExtensionsDir=/path/to/your/test/extensions"
      ]
    }
  }
}
```

**3. Restart your AI client**

### Development Workflow

**Standard workflow (manual rebuild):**
```bash
# 1. Edit TypeScript files
vim src/tools/extensions.ts

# 2. Build
npm run build

# 3. Restart AI client
# Cmd+R in VS Code (or restart your MCP client)

# 4. Test changes
# Ask AI to use the modified tool
```

**Hot-reload workflow (automatic rebuild):**
```bash
# 1. Update MCP configuration to use wrapper
# Edit ~/.claude.json:
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "node",
      "args": [
        "/absolute/path/to/chrome-devtools-mcp/scripts/mcp-wrapper.mjs"
      ],
      "cwd": "/absolute/path/to/chrome-devtools-mcp",
      "env": {
        "MCP_ENV": "development"
      }
    }
  }
}

# 2. Restart AI client ONCE (Cmd+R)

# 3. Edit TypeScript files
vim src/tools/extensions.ts

# 4. Changes automatically rebuild and reload
# No need to restart AI client!
# Just test your changes immediately
```

**Hot-reload benefits:**
- ✅ Automatic TypeScript compilation (`tsc -w`)
- ✅ Automatic server restart on file changes
- ✅ No VSCode Reload Window needed
- ✅ 2-5 second feedback loop (vs 20-30 seconds)

**See also:** [Hot-Reload Setup Guide](docs/hot-reload-setup-guide.md)

### Project Structure

```
chrome-devtools-mcp/
├── src/
│   ├── tools/              # MCP tool definitions
│   │   ├── extensions.ts   # Extension management (list, reload, debug)
│   │   ├── chatgpt-web.ts  # ChatGPT automation
│   │   └── ...
│   ├── browser.ts          # Browser/profile management
│   ├── main.ts             # MCP server entry point
│   └── graceful.ts         # Graceful shutdown
├── scripts/
│   ├── cli.mjs                    # Production entry (users)
│   ├── mcp-wrapper.mjs            # Development wrapper (hot-reload)
│   └── browser-globals-mock.mjs   # Node.js browser globals
├── build/                  # Compiled JavaScript (gitignored)
└── docs/                   # Documentation
```

### Internal Architecture

**For users (production):**
```
npx chrome-devtools-mcp-for-extension@latest
  ↓
scripts/cli.mjs
  ↓
node --import browser-globals-mock.mjs build/src/main.js
  ↓
MCP Server (single process, simple)
```

**For developers (hot-reload):**
```
node scripts/mcp-wrapper.mjs (MCP_ENV=development)
  ↓
tsc -w (automatic compilation)
  ↓
chokidar (file watcher)
  ↓
Auto-restart build/src/main.js on changes
  ↓
MCP Server (development mode, 2-5s reload)
```

**Key files:**
- `scripts/cli.mjs`: Simple wrapper for production (loads browser-globals-mock)
- `scripts/mcp-wrapper.mjs`: Development wrapper (hot-reload with tsc -w)
- `scripts/browser-globals-mock.mjs`: Polyfills for chrome-devtools-frontend in Node.js
- `src/main.ts`: Main MCP server (includes fallback browser globals)

**Why browser-globals-mock?**
- chrome-devtools-frontend expects browser globals (`location`, `self`, `localStorage`)
- Node.js doesn't have these globals
- `--import` flag loads the mock BEFORE any chrome-devtools-frontend modules

### Testing

```bash
# Build
npm run build

# Type check
npm run typecheck

# Run tests
npm test

# Format code
npm run format
```

### Publishing (Maintainers Only)

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Build
npm run build

# 3. Test locally
npx .

# 4. Publish to npm
npm publish

# 5. Push to GitHub
git push && git push --tags
```

---

## ✨ Features

- 🧩 **Extension Development**: Load, debug, and reload Chrome extensions
- 🏪 **Web Store Automation**: Automated submission with screenshots
- 🔧 **Browser Testing**: Test extensions in real user environments
- 🐛 **Advanced Debugging**: Service worker inspection, console monitoring
- 📸 **Screenshot Generation**: Auto-create store listing images
- 🤖 **ChatGPT Integration**: Automated ChatGPT interactions for research

---

## 📚 Common Workflows

### Create & Test Extension
```
1. "Create a Chrome extension that blocks ads"
2. "List extensions to verify it loaded"
3. "Test the extension on youtube.com"
4. "Show any errors from the extension"
```

### Debug Extension Issues
```
1. "List extensions and show any errors"
2. "Inspect service worker for my-ad-blocker"
3. "Show console messages"
4. "Reload the extension with latest changes"
```

### Publish to Web Store
```
1. "Generate screenshots for my extension"
2. "Validate manifest for Web Store compliance"
3. "Submit to Chrome Web Store"
```

---

## 🛠️ Core Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `list_extensions` | View all extensions | "List my extensions" |
| `reload_extension` | Hot-reload | "Reload my-extension" |
| `inspect_service_worker` | Debug background | "Debug service worker" |
| `ask_chatgpt_web` | ChatGPT research | "Ask ChatGPT about..." |
| `take_snapshot` | Page analysis | "Snapshot current page" |
| `list_pages` | Browser tabs | "List open pages" |

**See also:** [Full Tool Documentation](docs/tools-reference.md)

---

## 🔍 Troubleshooting

### Extension Not Loading

```
"List extensions and show any errors"
```

**Common fixes:**
- Verify manifest.json is at root of extension directory
- Check extension path in `--loadExtensionsDir`
- Ensure manifest is valid Manifest V3

### MCP Server Not Starting

**Check version:**
```bash
npx chrome-devtools-mcp-for-extension@latest --version
```

**Clear npx cache:**
```bash
npx clear-npx-cache
# or
rm -rf ~/.npm/_npx
```

**Check MCP configuration:**
```bash
cat ~/.claude.json | jq '.mcpServers'
```

### Hot-Reload Not Working (Developers)

**Verify development mode:**
```bash
ps aux | grep mcp-wrapper | grep MCP_ENV=development
```

**Check tsc -w is running:**
```bash
ps aux | grep 'tsc -w'
```

**Manually restart wrapper:**
```bash
pkill -f mcp-wrapper
# Then restart AI client (Cmd+R)
```

---

## 📖 Documentation

- [MCP Configuration Guide](docs/mcp-configuration-guide.md)
- [Hot-Reload Setup Guide](docs/hot-reload-setup-guide.md) (Developers)
- [Tools Reference](docs/tools-reference.md)
- [ChatGPT Integration](docs/chatgpt-integration.md)
- [Web Store Automation](docs/webstore-automation.md)

---

## 🙏 Credits

This project is a fork of [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) by Google LLC.

**Major additions:**
- Chrome extension development tools
- Web Store automation
- ChatGPT integration
- Hot-reload development workflow
- System profile management

---

## 📄 License

Apache-2.0

**Version**: 0.18.0
**Repository**: https://github.com/usedhonda/chrome-devtools-mcp
