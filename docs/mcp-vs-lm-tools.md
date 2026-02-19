# MCP Tools vs LM Tools

## Overview

VS Code DevTools exposes two distinct toolsets, each serving a different role and running in a different VS Code context.

## LM Tools (Language Model Tools)

**Context:** Host workspace (production VS Code instance)
**Purpose:** Stable, production-ready tools registered via `vscode.lm.registerTool()`
**Target audience:** Copilot and other language model agents working in the main VS Code session

### Available LM Tools

| Tool | Description |
|------|-------------|
| `output_read` | Read VS Code output channel logs from Host and Client sessions |
| `terminal_read` | Read terminal output, state, and detect prompts |
| `terminal_execute` | Execute commands in the terminal or send input to waiting terminals |
| `wait` | Wait for a specified duration (0–30000ms) before continuing |

### Characteristics

- Run **inside the Host VS Code process** with full VS Code API access
- Registered unconditionally at extension activation
- Can be individually enabled/disabled via VS Code's native **Configure Tools...** button in Copilot Chat
- Declared in `package.json` → `contributes.languageModelTools`
- Implemented in `extension/services/`

## MCP Tools (Model Context Protocol)

**Context:** Client workspace (Extension Development Host)
**Purpose:** Experimental and browser-automation tools served via the MCP server
**Target audience:** MCP clients (Inspector, Claude Desktop, etc.) connected to the stdio MCP server

### Standard MCP Tools

These tools interact with the Client's browser/webview and are considered stable:

| Tool | Description |
|------|-------------|
| `keyboard_hotkey` | Press key combinations |
| `keyboard_type` | Type text into inputs |
| `mouse_click` | Click elements |
| `mouse_drag` | Drag elements |
| `mouse_hover` | Hover over elements |
| `mouse_scroll` | Scroll elements |
| `take_snapshot` | Take an accessibility tree snapshot |
| `take_screenshot` | Take a screenshot |
| `read_console` | Read browser console messages |

### Experimental MCP Tools (exp_ prefix)

These tools are under active development and may change significantly:

| Tool | Description |
|------|-------------|
| `exp_codebase_map` | Get a structural map of the codebase |
| `exp_codebase_trace` | Trace a symbol through the codebase |
| `exp_codebase_lint` | Find dead code and quality issues |
| `exp_file_read` | Read files with flexible targeting |
| `exp_file_edit` | Edit files in the workspace |
| `exp_elicitation_demo` | Demonstrate MCP elicitation (SDK preview) |

### Characteristics

- Run in the **MCP server process** (Node.js, outside VS Code)
- Communicate with the Client VS Code via named pipes
- Served over MCP stdio transport (JSON-RPC)
- All tools available when the MCP server is connected
- Experimental tools prefixed with `exp_` to signal instability

## Key Differences

| Aspect | LM Tools | MCP Tools |
|--------|----------|-----------|
| Runtime | VS Code extension (Host) | MCP server process |
| Protocol | VS Code Language Model API | MCP (JSON-RPC over stdio) |
| Context | Host workspace | Client workspace |
| Toggle | Native VS Code tool config | Always available when connected |
| Stability | Production-ready | Standard + experimental |
| Naming | Plain names | Standard or `exp_` prefixed |

## Configuration

### Workspace Selection

The active workspace for MCP tools is configured via:

1. Config: `.devtools/host.config.jsonc` → `"clientWorkspace": "relative/or/absolute/path"`

The sidebar **Workspace Root** panel shows all Git repositories discovered by VS Code's Git extension. Selecting a repository writes its relative path to `.devtools/host.config.jsonc`.

### LM Tool Toggles

LM tools are registered unconditionally at extension startup. Users can enable/disable individual tools using VS Code's native **Configure Tools...** button in Copilot Chat.
