# VS Code DevTools MCP Skill

## Overview

This skill provides deep integration with VS Code through the Chrome DevTools Protocol (CDP). It enables efficient debugging, inspection, and automation of VS Code test workspaces with extensions.

## When to Use This Skill

Use this skill when:

- Debugging VS Code extensions in a test workspace
- Inspecting the DOM/state of VS Code webviews
- Automating VS Code UI interactions for testing
- Taking screenshots for documentation or debugging
- Evaluating JavaScript in the VS Code debug context

## Available Tool Categories

### Input Automation
- `mouse_click` - Click on UI elements in VS Code
- `mouse_drag` - Drag elements from one position to another
- `keyboard_type` - Type text into input fields
- `mouse_hover` - Hover over elements to trigger tooltips/menus
- `keyboard_hotkey` - Send keyboard shortcuts
- `mouse_scroll` - Scroll within VS Code views

### Inspection and Debugging
- `snapshot` - Get the current DOM state of VS Code
- `console` - Read console output from extension host
- `debug-evaluate` - Evaluate JavaScript in the debug context
- `screenshot` - Capture screenshots of VS Code window

### Monitoring
- `output-panel` - Read from VS Code output panels

### Script Execution
- `script` - Execute JavaScript in the VS Code context

### Wait Operations
- `wait` - Wait for specific conditions or elements

## Configuration

The MCP server accepts these flags:

- `--extension` (`-e`): Path to the extension development folder
- `--test-workspace` (`-w`): Path to the test workspace folder

## Example Usage

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

## Best Practices

1. **Use Hot Reload**: The server automatically detects extension changes and rebuilds before each tool call
2. **Minimize Screenshots**: Only take screenshots when visual verification is necessary
3. **Use Snapshots First**: Get DOM snapshots before attempting UI interactions
4. **Handle Dialogs**: Use the `handle_dialog` tool to respond to VS Code dialogs
5. **Wait for Elements**: Use wait operations before interacting with dynamic UI

## Limitations

- Requires VS Code to be running with CDP enabled
- Some VS Code internals may not be accessible via CDP

## Troubleshooting

### Extension not loading
- Verify the extension path is correct
- Ensure the extension has been built (`pnpm run compile`)
- Check the VS Code output panel for errors

### CDP connection failed
- VS Code may need to be restarted with debug flags
- Check if another CDP client is connected

### Tool calls timing out
- VS Code may be busy with background tasks
- Increase timeout values in tool calls
