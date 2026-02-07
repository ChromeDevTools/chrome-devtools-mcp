# MCP Setup Guide for chrome-ai-bridge

## 📦 Installation

First, install the package globally (optional):

```bash
npm install -g chrome-ai-bridge
```

## 🔧 MCP Configuration

### For Claude Code (Recommended)

```bash
claude mcp add chrome-ai-bridge npx chrome-ai-bridge@latest
```

This automatically creates the configuration and handles everything for you.

### For Other MCP Clients (Manual Setup)

#### Global Configuration (Recommended)

Add to the **root level** of your MCP client configuration file:

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

**Benefits of global configuration:**

- ✅ Applies to all projects automatically
- ✅ Single source of truth for MCP settings
- ✅ Easy to maintain and update
- ✅ No need to configure per-project

**Configuration file locations:**

- **Claude Code**: `~/.claude.json` (global mcpServers section)
- **Cursor**: `~/.cursor/extensions_config.json`
- **VS Code Copilot**: `.vscode/settings.json` or global settings
- **Cline**: Follow Cline's MCP setup guide

#### Project-Specific Configuration (Not Recommended)

For Claude Code, you can also add project-specific configuration, but it's generally not needed:

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": ["chrome-ai-bridge@latest"]
    }
  },
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "chrome-ai-bridge": {
          "command": "npx",
          "args": ["chrome-ai-bridge@latest"]
        }
      }
    }
  }
}
```

**Note:** Project-specific settings override global settings. Use this only if you need different configurations for different projects

### Configuration Note (v2.0.0+)

> **⚠️ v2.0.0 Breaking Change**
>
> v2.0.0 switched to Chrome extension mode. The following CLI options from v1.x are **no longer supported**:
> - `--headless`, `--channel`, `--loadExtension`, `--loadExtensionsDir`
> - `--loadSystemExtensions`, `--isolated`, `--userDataDir`
>
> See [README.md](../../README.md) for the new setup process using the Chrome extension.

## 🚀 Usage Examples (Global Configuration)

All examples below use **global configuration** in `~/.claude.json`. These configurations apply to all your projects.

### Basic Setup (Zero Configuration)

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

## 🔌 Chrome Extension Setup

Before using chrome-ai-bridge, install the Chrome extension:

1. Build the extension: `npm run build`
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked" and select the `build/extension/` directory
5. Open ChatGPT and/or Gemini tabs and log in

> **v2.1 Note**: Network-native response extraction is enabled automatically. No additional configuration is needed — responses are captured at the network protocol level for improved reliability.

## 🔄 After Configuration

1. **Restart your MCP client** (Claude Code, Cursor, etc.) to load the new configuration
2. Look for the MCP tools in your client's interface
3. You should see "chrome-ai-bridge" tools available

## 📝 Available Tools

Once configured, you can use these tools:

### AI Consultation Tools

- `ask_chatgpt_web` - Ask ChatGPT via browser
- `ask_gemini_web` - Ask Gemini via browser
- `ask_chatgpt_gemini_web` - Ask both AIs in parallel (recommended)

### Debug Tools

- `take_cdp_snapshot` - Get CDP page state for debugging
- `get_page_dom` - Query DOM elements with CSS selectors

## 💡 Example Commands

Once configured, you can say things like:

- "Ask ChatGPT how to implement OAuth in Node.js"
- "Ask Gemini to review this architecture"
- "Ask both AIs for their opinions on this approach"
- "Take a CDP snapshot of ChatGPT page"

## 🐛 Troubleshooting

### MCP not showing in client

1. **For Claude Code**: Use `claude mcp list` to verify installation
2. Make sure the configuration is valid
3. Restart your MCP client completely

### Extension not connecting

1. Verify the Chrome extension is installed in `chrome://extensions/`
2. Check that ChatGPT/Gemini tabs are open and logged in
3. Click the extension icon to check connection status

### ChatGPT/Gemini not responding

1. Ensure you're logged in to both services
2. Try refreshing the ChatGPT/Gemini tab
3. Check for rate limiting or service issues

## 📚 More Information

- **This Fork**: [GitHub](https://github.com/usedhonda/chrome-ai-bridge) | [npm](https://www.npmjs.com/package/chrome-ai-bridge)
- **Original Project**: [GitHub](https://github.com/ChromeDevTools/chrome-ai-bridge)
