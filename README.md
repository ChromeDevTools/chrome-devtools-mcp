# Chrome DevTools MCP

`chrome-devtools-mcp` is a server that enables Model-Context-Protocol (MCP)
clients to automate Chrome for debugging purposes. This is an early experimental
prototype!

## Disclaimers

`chrome-devtools-mcp` exposes content of the browser instance to the MCP clients
allowing them to inspect, debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do want to share with
MCP clients.

## Requirements

- [Node.js 22](https://nodejs.org/) or newer.
- [Chrome](https://www.google.com/chrome/) current stable version or newer.
- [npm](https://www.npmjs.com/).

## Getting started

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "chrome-devtools-mcp": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

> [!NOTE]  
> `Using `chrome-devtools-mcp@latest` ensures that your MCP client will always use the latest version of the Chrome DevTools MCP server.

### MCP Client specific configuration

<details>
  <summary>Cursor</summary>
  Follow https://docs.cursor.com/en/context/mcp#using-mcp-json and use the config provided above.
</details>

<details>
  <summary>Claude Code</summary>
    Use the Claude Code CLI to add the Chrome DevTools MCP server ([guide](https://docs.anthropic.com/en/docs/claude-code/mcp)):

```bash
claude mcp add chrome-devtools-mcp npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Cline</summary>
  Follow https://docs.cline.bot/mcp/configuring-mcp-servers and use the config provided above.
</details>

<details>
  <summary>Copilot / VS Code</summary>
  Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server),
  with the standard config from above. You can also install the Chrome DevTools MCP server using the VS Code CLI:
  
  ```bash
  code --add-mcp '{"name":"chrome-devtools-mcp","command":"npx","args":["chrome-devtools-mcp@latest"]}'
  ```
</details>

<details>
  <summary>Gemini CLI</summary>
  Follow the [MCP guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-set-up-your-mcp-server)
  using the standard config from above.
</details>

<details>
  <summary>Gemini Code Assist</summary>
  Follow the [configure MCP guide](https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers)
  using the standard config from above.
</details>

## Tools

<!-- BEGIN AUTO GENERATED TOOLS -->

- **Input automation** (7 tools)
  - [`click`](docs/tool-reference.md#click)
  - [`drag`](docs/tool-reference.md#drag)
  - [`fill`](docs/tool-reference.md#fill)
  - [`fill_form`](docs/tool-reference.md#fill_form)
  - [`handle_dialog`](docs/tool-reference.md#handle_dialog)
  - [`hover`](docs/tool-reference.md#hover)
  - [`upload_file`](docs/tool-reference.md#upload_file)
- **Navigation automation** (7 tools)
  - [`close_page`](docs/tool-reference.md#close_page)
  - [`list_pages`](docs/tool-reference.md#list_pages)
  - [`navigate_page`](docs/tool-reference.md#navigate_page)
  - [`navigate_page_history`](docs/tool-reference.md#navigate_page_history)
  - [`new_page`](docs/tool-reference.md#new_page)
  - [`select_page`](docs/tool-reference.md#select_page)
  - [`wait_for`](docs/tool-reference.md#wait_for)
- **Emulation** (3 tools)
  - [`emulate_cpu`](docs/tool-reference.md#emulate_cpu)
  - [`emulate_network`](docs/tool-reference.md#emulate_network)
  - [`resize_page`](docs/tool-reference.md#resize_page)
- **Performance** (2 tools)
  - [`performance_start_trace`](docs/tool-reference.md#performance_start_trace)
  - [`performance_stop_trace`](docs/tool-reference.md#performance_stop_trace)
- **Network** (2 tools)
  - [`get_network_request`](docs/tool-reference.md#get_network_request)
  - [`list_network_requests`](docs/tool-reference.md#list_network_requests)
- **Debugging** (4 tools)
  - [`evaluate_script`](docs/tool-reference.md#evaluate_script)
  - [`list_console_messages`](docs/tool-reference.md#list_console_messages)
  - [`take_screenshot`](docs/tool-reference.md#take_screenshot)
  - [`take_snapshot`](docs/tool-reference.md#take_snapshot)

<!-- END AUTO GENERATED TOOLS -->

## Configuration

For example, to launch the system-installed Chrome Canary pass `--channel=canary` as an argument:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest"
        "--channel=canary",
      ]
    }
  }
}
```

### User data directory

`chrome-devtools-mcp` starts a Chrome's stable channel instance using the user
data directory at `$HOME/.cache/chrome-devtools-mcp/mcp-profile-$CHANNEL` on
Linux/MacOS and `%HOMEPATH%/.cache/chrome-devtools-mcp/mcp-profile-$CHANNEL` in
Windows. The user data directory is not cleared between runs and shared across
all instances of `chrome-devtools-mcp`.

## CLI

Run `npx chrome-devtools-mcp@latest --help` to see all available configuration options:

<!-- BEGIN AUTO GENERATED CLI -->

```sh
Options:
      --version         Show version number  [boolean]
  -u, --browserUrl      The browser URL to connect to  [string]
      --headless        Whether to run in headless (no UI) mode  [boolean] [default: false]
  -e, --executablePath  Path to custom Chrome executable  [string]
      --isolated        If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed.  [boolean] [default: false]
      --channel         System installed browser channel to use.  [string] [choices: "stable", "canary", "beta", "dev"]
      --help            Show help  [boolean]

Examples:
  npx chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222  Connect to an existing browser instance
  npx chrome-devtools-mcp@latest --channel beta                      Use Chrome Beta installed on this system
  npx chrome-devtools-mcp@latest --channel canary                    Use Chrome Canary installed on this system
  npx chrome-devtools-mcp@latest --channel dev                       Use Chrome Dev installed on this system
  npx chrome-devtools-mcp@latest --channel stable                    Use stable Chrome installed on this system
  npx chrome-devtools-mcp@latest --logFile /tmp/log.txt              Save logs to a file
  npx chrome-devtools-mcp@latest --help                              Print CLI options
```

<!-- END AUTO GENERATED CLI -->
