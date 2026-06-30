# Electron DevTools MCP

MCP server for Electron apps, based on [chrome-devtools-mcp](https://github.com/nicholasgma/chrome-devtools-mcp).

Lets your coding agent (Claude Code, Cursor, Copilot, etc.) control and inspect a running Electron app via the Chrome DevTools Protocol (CDP).

## What's different from chrome-devtools-mcp?

- **Electron detection**: Automatically detects Electron via `/json/version` and disables `handleDevToolsAsPage` (which Electron doesn't support)
- **`connect` tool**: Switch between CDP instances on the fly without restarting
- **`list_instances` tool**: Scan ports 9222-9231 for running Electron/Chrome instances
- **`--cdp-url` alias**: Convenient alias for `--browser-url`
- **Puppeteer patch**: Handles missing `Target.getDevToolsTarget` in Electron gracefully

## Requirements

- [Node.js](https://nodejs.org/) v20.19+
- An Electron app running with `--remote-debugging-port` enabled

## Getting started

### Claude Code

```bash
claude mcp add electron-devtools -- node /path/to/electron-devtools-mcp/build/src/bin/chrome-devtools-mcp.js --cdp-url http://127.0.0.1:9222
```

### Generic MCP config

```json
{
  "mcpServers": {
    "electron-devtools": {
      "command": "node",
      "args": [
        "/path/to/electron-devtools-mcp/build/src/bin/chrome-devtools-mcp.js",
        "--cdp-url", "http://127.0.0.1:9222"
      ]
    }
  }
}
```

### Enabling CDP in your Electron app

Your Electron app needs to expose a CDP port. Add this before `app.ready`:

```js
app.commandLine.appendSwitch('remote-debugging-port', '9222')
```

## Build from source

```bash
npm install
npm run build
```

## Multiple instances

The `list_instances` tool scans ports 9222-9231 for running instances. Use the `connect` tool to switch between them:

1. Start multiple Electron instances on different ports (9222, 9223, etc.)
2. Use `list_instances` to see what's running
3. Use `connect` with a port number to switch

## Upstream

This fork tracks [ChromeDevTools/chrome-devtools-mcp](https://github.com/nicholasgma/chrome-devtools-mcp). All original Chrome DevTools tools (screenshots, snapshots, network, console, performance, etc.) are available.

See the upstream [tool reference](./docs/tool-reference.md) for the full list.

## License

Apache-2.0 (same as upstream)
