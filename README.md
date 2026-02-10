# VS Code DevTools MCP

MCP server for controlling and inspecting VS Code with extensions through the Chrome DevTools Protocol (CDP).

## Overview

`vscode-devtools-mcp` enables AI coding assistants to control and debug VS Code instances running extensions. It provides:

- **Extension Debugging**: Inspect and debug VS Code extensions in real-time
- **Hot Reload**: Automatically rebuilds extensions when source changes are detected
- **UI Automation**: Interact with VS Code UI elements programmatically
- **Performance Analysis**: Profile extension performance using CDP

## [Tool Reference](./docs/tool-reference.md) | [Changelog](./CHANGELOG.md) | [Contributing](./CONTRIBUTING.md)

## Installation

```sh
cd vscode-devtools-mcp
pnpm install
pnpm run build
```

## Usage

### Command Line Arguments

```sh
node build/src/index.js --extension <path> --test-workspace <path>
```

| Flag | Alias | Description |
|------|-------|-------------|
| `--extension` | `-e` | Path to the extension development folder |
| `--test-workspace` | `-w` | Path to the test workspace folder |

### MCP Configuration

Add to your MCP client's configuration:

```json
{
  "mcpServers": {
    "vscode-devtools": {
      "command": "node",
      "args": [
        "/path/to/vscode-devtools-mcp/build/src/index.js",
        "--extension", "/path/to/your/extension",
        "--test-workspace", "/path/to/test/workspace"
      ]
    }
  }
}
```

## Features

### Hot Reload

The server automatically detects changes to your extension source files. Before each MCP tool call, it:

1. Checks if extension files have changed (via content hashing)
2. Closes the test workspace window
3. Rebuilds the extension using the `ext:build` task
4. Relaunches VS Code with the new extension

### Available Tools

- **Input Automation**: click, drag, type, hover, hotkey, scroll
- **Inspection**: snapshot, console, debug-evaluate, screenshot
- **Monitoring**: network, performance, output-panel
- **Script Execution**: script
- **Wait Operations**: wait for elements/conditions

See the [Tool Reference](./docs/tool-reference.md) for complete documentation.

## Development

### Building

```sh
pnpm run build
```

### Type Checking

```sh
pnpm run typecheck
```

### Testing

```sh
pnpm run test
```

### Updating Documentation

```sh
pnpm run docs
```

## License

Apache-2.0
