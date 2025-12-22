# Troubleshooting

## General tips

- Run `npx chrome-devtools-mcp@latest --help` to test if the MCP server runs on your machine.
- Make sure that your MCP client uses the same npm and node version as your terminal.
- When configuring your MCP client, try using the `--yes` argument to `npx` to
  auto-accept installation prompt.
- Find a specific error in the output of the `chrome-devtools-mcp` server.
  Usually, if your client is an IDE, logs would be in the Output pane.

## Debugging

When reporting issues or diagnosing problems, enable debug logging to capture detailed information.

### Standalone debugging

Start the MCP server with debugging enabled and a log file:

```sh
DEBUG=* npx chrome-devtools-mcp@latest --log-file=/path/to/chrome-devtools-mcp.log
```

On Windows (PowerShell):
```powershell
$env:DEBUG="*"; npx chrome-devtools-mcp@latest --log-file=C:\path\to\chrome-devtools-mcp.log
```

### Debugging with an MCP client

Configure your MCP client to enable debug logging:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--log-file",
        "/path/to/chrome-devtools-mcp.log"
      ],
      "env": {
        "DEBUG": "*"
      }
    }
  }
}
```

The log file will contain detailed information about:
- Server startup and initialization
- Tool invocations and parameters
- Chrome DevTools Protocol (CDP) messages
- Error stack traces

## Specific problems

### `Error [ERR_MODULE_NOT_FOUND]: Cannot find module ...`

This usually indicates either a non-supported Node version is in use or that the
`npm`/`npx` cache is corrupted. Try clearing the cache, uninstalling
`chrome-devtools-mcp` and installing it again. Clear the cache by running:

```sh
rm -rf ~/.npm/_npx # NOTE: this might remove other installed npx executables.
npm cache clean --force
```

### `Target closed` error

This indicates that the browser could not be started or the connection was lost. Common causes and solutions:

1. **Chrome already running**: Close all Chrome instances and try again
2. **Chrome not installed**: Make sure you have the latest stable Chrome installed
3. **System requirements**: Verify [your system is able to run Chrome](https://support.google.com/chrome/a/answer/7100626?hl=en)
4. **Port conflict**: If using `--browser-url`, ensure the debugging port (e.g., 9222) is not already in use
5. **User data directory locked**: Try using `--isolated` flag to create a temporary profile

Example with isolated mode:
```sh
npx -y chrome-devtools-mcp@latest --isolated
```

### Configuration file not being recognized

If your MCP client is not loading the chrome-devtools-mcp server, check:

1. **File location**: Ensure the configuration file is in the correct location for your MCP client
2. **JSON syntax**: Validate your JSON using a linter or online validator
3. **Quotes**: Use double quotes for all JSON strings, not single quotes
4. **Trailing commas**: Remove any trailing commas in JSON objects or arrays

Example of valid configuration:
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

### Remote debugging between virtual machine (VM) and host fails

When connecting DevTools inside a VM to Chrome running on the host, any domain is rejected by Chrome because of host header validation. Tunneling the port over SSH bypasses this restriction. In the VM, run:

```sh
ssh -N -L 127.0.0.1:9222:127.0.0.1:9222 <user>@<host-ip>
```

Point the MCP connection inside the VM to `http://127.0.0.1:9222` and DevTools
will reach the host browser without triggering the Host validation.
