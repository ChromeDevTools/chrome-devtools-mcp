# MCP Setup Guide for chrome-devtools-mcp-for-extension

## 📦 Installation

First, install the package globally (optional):

```bash
npm install -g chrome-devtools-mcp-for-extension
```

## 🔧 MCP Configuration

### For Claude Code (Recommended)

```bash
claude mcp add chrome-devtools-extension npx chrome-devtools-mcp-for-extension@latest
```

This automatically creates the configuration and handles everything for you.

### For Other MCP Clients (Manual Setup)

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"],
      "env": {}
    }
  }
}
```

**Configuration file locations:**
- **Cursor**: `~/.cursor/extensions_config.json`
- **VS Code Copilot**: `.vscode/settings.json`
- **Cline**: Follow Cline's MCP setup guide

### With Options

You can add various options to customize the behavior:

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--headless=false",
        "--loadExtension=/path/to/your/extension"
      ],
      "env": {}
    }
  }
}
```

### Available Options

- `--headless`: Run Chrome in headless mode (default: false)
- `--channel`: Chrome channel to use (stable, beta, canary, dev)
- `--loadExtension`: Path to extension directory to load
- `--loadExtensionsDir`: Path to directory containing multiple extensions
- `--loadSystemExtensions`: Load extensions from system Chrome profile
- `--isolated`: Use temporary profile instead of system profile
- `--userDataDir`: Custom Chrome profile directory

## 🚀 Usage Examples

### Basic Setup (Zero Configuration)
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"],
      "env": {}
    }
  }
}
```
This will automatically detect and use your system Chrome profile with all installed extensions.

### For Extension Development
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--headless=false",
        "--loadExtension=/Users/yourname/my-extension"
      ],
      "env": {}
    }
  }
}
```

### Isolated Testing Environment
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--isolated"
      ],
      "env": {}
    }
  }
}
```

## 🔄 After Configuration

1. **Restart your MCP client** (Claude Code, Cursor, etc.) to load the new configuration
2. Look for the MCP tools in your client's interface
3. You should see "chrome-devtools-extension" tools available

## 📝 Available Tools

Once configured, you can use these tools:

### Essential Extension Tools
- `list_extensions` - List all installed Chrome extensions
- `reload_extension` - Reload an extension after making changes
- `inspect_service_worker` - Debug extension's background scripts

### Web Store Submission Tools
- `submit_to_webstore` - Automatically prepare and submit extension to Chrome Web Store
- `generate_extension_screenshots` - Generate screenshots for store listing

### Browser Control Tools
- `navigate_page` - Navigate to any URL
- `take_screenshot` - Capture screenshots
- `click`, `fill`, `fill_form` - Interact with web pages
- And 30+ more tools...

## 💡 Example Commands

Once configured, you can say things like:

- "List all my Chrome extensions"
- "Reload my extension named 'MyExtension'"
- "Debug the service worker for my extension"
- "Prepare my extension for Chrome Web Store submission"
- "Generate screenshots for my extension"
- "Navigate to google.com and take a screenshot"

## 🐛 Troubleshooting

### MCP not showing in client
1. **For Claude Code**: Use `claude mcp list` to verify installation
2. Make sure the configuration is valid
3. Restart your MCP client completely

### Chrome launches but extensions don't load
1. Use `--headless=false` to see what's happening
2. Make sure extension paths are absolute, not relative
3. Check that manifest.json is valid

### Permission errors
1. Make sure Chrome is not already running with the same profile
2. Try using `--isolated` flag for a clean profile
3. Check file permissions on extension directories

## 📚 More Information

- **This Fork**: [GitHub](https://github.com/usedhonda/chrome-devtools-mcp) | [npm](https://www.npmjs.com/package/chrome-devtools-mcp-for-extension)
- **Original Project**: [GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp)