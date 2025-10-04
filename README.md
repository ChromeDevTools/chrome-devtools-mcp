# Chrome DevTools MCP

[![npm chrome-devtools-mcp package](https://img.shields.io/npm/v/chrome-devtools-mcp.svg)](https://npmjs.org/package/chrome-devtools-mcp)

`chrome-devtools-mcp` empowers your AI coding assistant (like Gemini, Claude, Cursor, or Copilot) to control and inspect a live Chrome browser. It acts as a Model-Context-Protocol (MCP) server, giving your agent access to the full power of Chrome DevTools for reliable automation, in-depth debugging, and performance analysis.

This means you can ask your AI assistant to perform tasks like:

*   "Analyze the performance of my web app and suggest improvements."
*   "Navigate to the login page, fill in the form with test credentials, and take a screenshot of the dashboard."
*   "Debug the console errors on this page and tell me what's wrong."

## Table of Contents

*   [Key Features](#key-features)
*   [Getting Started](#getting-started)
    *   [Prerequisites](#prerequisites)
    *   [Installation](#installation)
    *   [Your First Prompt](#your-first-prompt)
*   [Usage Examples](#usage-examples)
*   [Tools Reference](#tools-reference)
*   [Configuration](#configuration)
*   [How It Works](#how-it-works)
*   [Troubleshooting](#troubleshooting)
*   [Contributing](#contributing)
*   [Disclaimer](#disclaimer)

## Key Features

*   **Reliable Automation:** Uses [Puppeteer](https://github.com/puppeteer/puppeteer) to automate actions in Chrome, automatically waiting for actions to complete and the page to be ready for the next command.
*   **Powerful Debugging:** Inspect the DOM, analyze network requests, check the browser console, and take screenshots.
*   **Performance Insights:** Leverages [Chrome DevTools](https://github.com/ChromeDevTools/devtools-frontend) to record performance traces and extract actionable insights to help you improve your web application's performance.
*   **Multi-Page Support:** Manage multiple browser tabs, switch between them, and perform actions on specific pages.
*   **Extensive Toolset:** A rich set of tools for everything from simple clicks to complex performance analysis.

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) v20.19 or a newer [LTS version](https://github.com/nodejs/Release#release-schedule).
*   [Google Chrome](https://www.google.com/chrome/) (Stable channel recommended).
*   An AI coding assistant that supports the Model-Context-Protocol (MCP).

### Installation

The easiest way to use `chrome-devtools-mcp` is to configure your MCP client to use `npx`. This ensures you are always using the latest version.

Add the following configuration to your MCP client:

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

<details>
  <summary>Click here for instructions for your specific MCP client</summary>

  <details>
    <summary>Claude Code</summary>
      Use the Claude Code CLI to add the Chrome DevTools MCP server (<a href="https://docs.anthropic.com/en/docs/claude-code/mcp">guide</a>):

  ```bash
  claude mcp add chrome-devtools npx chrome-devtools-mcp@latest
  ```

  </details>

  <details>
    <summary>Cline</summary>
    Follow https://docs.cline.bot/mcp/configuring-mcp-servers and use the config provided above.
  </details>

  <details>
    <summary>Codex</summary>
    Follow the <a href="https://github.com/openai/codex/blob/main/docs/advanced.md#model-context-protocol-mcp">configure MCP guide</a>
    using the standard config from above. You can also install the Chrome DevTools MCP server using the Codex CLI:

  ```bash
  codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
  ```

  **On Windows 11**

  Configure the Chrome install location and increase the startup timeout by updating `.codex/config.toml` and adding the following `env` and `startup_timeout_ms` parameters:

  ```
  [mcp_servers.chrome-devtools]
  command = "cmd"
  args = [
      "/c",
      "npx",
      "-y",
      "chrome-devtools-mcp@latest",
  ]
  env = { SystemRoot="C:\\Windows", PROGRAMFILES="C:\\Program Files" }
  startup_timeout_ms = 20_000
  ```

  </details>

  <details>
    <summary>Copilot CLI</summary>

  Start Copilot CLI:

  ```
  copilot
  ```

  Start the dialog to add a new MCP server by running:

  ```
  /mcp add
  ```

  Configure the following fields and press `CTR-S` to save the configuration:

  - **Server name:** `chrome-devtools`
  - **Server Type:** `[1] Local`
  - **Command:** `npx`
  - **Arguments:** `-y, chrome-devtools-mcp@latest`

  </details>

  <details>
    <summary>Copilot / VS Code</summary>
    Follow the MCP install <a href="https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server">guide</a>,
    with the standard config from above. You can also install the Chrome DevTools MCP server using the VS Code CLI:

    ```bash
    code --add-mcp '{"name":"chrome-devtools","command":"npx","args":["chrome-devtools-mcp@latest"]}'
    ```
  </details>

  <details>
    <summary>Cursor</summary>

  **Click the button to install:**

  [<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=chrome-devtools&config=eyJjb21tYW5kIjoibnB4IC15IGNocm9tZS1kZXZ0b29scy1tY3BAbGF0ZXN0In0%3D)

  **Or install manually:**

  Go to `Cursor Settings` -> `MCP` -> `New MCP Server`. Use the config provided above.

  </details>

  <details>
    <summary>Gemini CLI</summary>
  Install the Chrome DevTools MCP server using the Gemini CLI.

  **Project wide:**

  ```bash
  gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest
  ```

  **Globally:**

  ```bash
  gemini mcp add -s user chrome-devtools npx chrome-devtools-mcp@latest
  ```

  Alternatively, follow the <a href="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-set-up-your-mcp-server">MCP guide</a> and use the standard config from above.

  </details>

  <details>
    <summary>Gemini Code Assist</summary>
    Follow the <a href="https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers">configure MCP guide</a>
    using the standard config from above.
  </details>

  <details>
    <summary>JetBrains AI Assistant & Junie</summary>

  Go to `Settings | Tools | AI Assistant | Model Context Protocol (MCP)` -> `Add`. Use the config provided above.
  The same way chrome-devtools-mcp can be configured for JetBrains Junie in `Settings | Tools | Junie | MCP Settings` -> `Add`. Use the config provided above.

  </details>

  <details>
    <summary>Visual Studio</summary>

    **Click the button to install:**

    [<img src="https://img.shields.io/badge/Visual_Studio-Install-C16FDE?logo=visualstudio&logoColor=white" alt="Install in Visual Studio">](https://vs-open.link/mcp-install?%7B%22name%22%3A%22chrome-devtools%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22chrome-devtools-mcp%40latest%22%5D%7D)
  </details>

  <details>
    <summary>Warp</summary>

  Go to `Settings | AI | Manage MCP Servers` -> `+ Add` to [add an MCP Server](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server). Use the config provided above.

  </details>
</details>

### Your First Prompt

To check if everything is working, enter the following prompt in your MCP client:

```
@chrome-devtools Check the performance of https://developers.chrome.com
```

Your MCP client should open a Chrome browser window and record a performance trace.

> [!NOTE]
> The MCP server will start the browser automatically when you use a tool that requires a running browser instance. Simply connecting to the server won't start the browser.

## Usage Examples

Here are a few examples of what you can do with `chrome-devtools-mcp`.

### Analyze Website Performance

**Prompt:**
```
@chrome-devtools Start a performance trace of https://pptr.dev, then stop the trace and give me a summary of the performance insights.
```

This will navigate to the Puppeteer documentation website, record a performance trace, and provide a summary of potential performance issues and Core Web Vitals.

### Automate Form Submission

**Prompt:**
```
@chrome-devtools Navigate to https://www.google.com, take a snapshot of the page, then use the snapshot to fill the search box with "puppeteer" and click the "Google Search" button.
```

This demonstrates how to automate form submissions by first inspecting the page structure and then using the element UIDs to interact with them.

### Debugging a Web Page

**Prompt:**
```
@chrome-devtools Navigate to https://angular.io/ and list any console errors. Then take a full-page screenshot and save it to a file named 'angular-home.png'.
```

This is useful for quickly identifying client-side errors and capturing the state of the page for further analysis.

## Tools Reference

For a detailed list of all available tools and their parameters, please see the [Tool Reference](./docs/tool-reference.md).

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
- **Performance** (3 tools)
  - [`performance_analyze_insight`](docs/tool-reference.md#performance_analyze_insight)
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

You can customize the behavior of `chrome-devtools-mcp` by passing command-line arguments.

<!-- BEGIN AUTO GENERATED OPTIONS -->

- **`--browserUrl`, `-u`**
  Connect to a running Chrome instance using port forwarding. For more details see: https://developer.chrome.com/docs/devtools/remote-debugging/local-server.
  - **Type:** string

- **`--headless`**
  Whether to run in headless (no UI) mode.
  - **Type:** boolean
  - **Default:** `false`

- **`--executablePath`, `-e`**
  Path to custom Chrome executable.
  - **Type:** string

- **`--isolated`**
  If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed.
  - **Type:** boolean
  - **Default:** `false`

- **`--channel`**
  Specify a different Chrome channel that should be used. The default is the stable channel version.
  - **Type:** string
  - **Choices:** `stable`, `canary`, `beta`, `dev`

- **`--logFile`**
  Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.
  - **Type:** string

- **`--viewport`**
  Initial viewport size for the Chrome instances started by the server. For example, `1280x720`
  - **Type:** string

- **`--proxyServer`**
  Proxy server configuration for Chrome passed as --proxy-server when launching the browser. See https://www.chromium.org/developers/design-documents/network-settings/ for details.
  - **Type:** string

- **`--acceptInsecureCerts`**
  If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.
  - **Type:** boolean

<!-- END AUTO GENERATED OPTIONS -->

Pass them via the `args` property in your MCP client's JSON configuration. For example:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--channel=canary",
        "--headless=true",
        "--isolated=true"
      ]
    }
  }
}
```

You can also run `npx chrome-devtools-mcp@latest --help` to see all available configuration options.

## How It Works

`chrome-devtools-mcp` is a server that implements the [Model-Context-Protocol (MCP)](https://github.com/model-context-protocol/specification). It uses [Puppeteer](https://pptr.dev/) to launch and control a Chrome browser instance. When your AI assistant calls a tool, the MCP server translates that request into a series of Puppeteer commands that are executed in the browser. The results are then formatted and sent back to the assistant.

By default, `chrome-devtools-mcp` starts a Chrome instance using a dedicated user data directory to avoid interfering with your personal browsing profile. This directory is located at:

*   **Linux / macOS:** `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
*   **Windows:** `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

You can use the `--isolated` flag to create a temporary user data directory that is cleaned up after the browser is closed.

## Troubleshooting

If you encounter any issues, please refer to our [Troubleshooting Guide](./docs/troubleshooting.md).

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for more details.

## Disclaimer

`chrome-devtools-mcp` exposes the content of the browser instance to the MCP clients, allowing them to inspect, debug, and modify any data in the browser or DevTools. Avoid sharing sensitive or personal information that you don't want to share with MCP clients.