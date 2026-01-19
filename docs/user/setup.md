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

### With Options (Global Configuration)

You can add various options to customize the behavior in your global configuration:

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": [
        "chrome-ai-bridge@latest",
        "--headless=false",
        "--loadExtension=/path/to/your/extension"
      ]
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

This will automatically detect and use your system Chrome profile with all installed extensions.

### For Extension Development

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": [
        "chrome-ai-bridge@latest",
        "--headless=false",
        "--loadExtension=/Users/yourname/my-extension"
      ]
    }
  }
}
```

### Load Multiple Extensions from Directory

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": [
        "chrome-ai-bridge@latest",
        "--loadExtensionsDir=/Users/yourname/projects/Chrome-Extension"
      ]
    }
  }
}
```

### Isolated Testing Environment

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": ["chrome-ai-bridge@latest", "--isolated"]
    }
  }
}
```

## 📋 Configuration Scope: Global vs Project-Specific

### Global Configuration (Recommended)

**Location:** Root level of `~/.claude.json`

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

**When to use:**

- ✅ You want the same MCP configuration for all projects
- ✅ You want to simplify maintenance (single place to update)
- ✅ You're developing multiple extensions that share the same setup
- ✅ Most common use case - **recommended for most users**

### Project-Specific Configuration (Advanced)

**Location:** Inside `projects` section of `~/.claude.json`

```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": ["chrome-ai-bridge@latest"]
    }
  },
  "projects": {
    "/Users/yourname/project-a": {
      "mcpServers": {
        "chrome-ai-bridge": {
          "command": "npx",
          "args": [
            "chrome-ai-bridge@latest",
            "--loadExtension=/Users/yourname/project-a/extension"
          ]
        }
      }
    }
  }
}
```

**When to use:**

- You need different extension configurations for different projects
- Project-A needs `--isolated` mode, but Project-B needs system extensions
- You want to override global settings for specific projects

**Note:** Project-specific settings **override** global settings when working in that project.

### Updating Configuration

#### Update Global Configuration (Recommended)

```bash
# Backup first
cp ~/.claude.json ~/.claude.json.backup

# Update using jq
jq '.mcpServers."chrome-ai-bridge".args = [
  "chrome-ai-bridge@latest",
  "--loadExtensionsDir=/path/to/extensions"
]' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
```

#### Update Project-Specific Configuration (Advanced)

```bash
# Backup first
cp ~/.claude.json ~/.claude.json.backup

# Update using jq
jq --arg project "/path/to/your/project" '
  .projects[$project].mcpServers."chrome-ai-bridge".args = [
    "chrome-ai-bridge@latest",
    "--loadExtension=/path/to/extension"
  ]
' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
```

## 🔄 After Configuration

1. **Restart your MCP client** (Claude Code, Cursor, etc.) to load the new configuration
2. Look for the MCP tools in your client's interface
3. You should see "chrome-ai-bridge" tools available

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

- **This Fork**: [GitHub](https://github.com/usedhonda/chrome-ai-bridge) | [npm](https://www.npmjs.com/package/chrome-ai-bridge)
- **Original Project**: [GitHub](https://github.com/ChromeDevTools/chrome-ai-bridge)
