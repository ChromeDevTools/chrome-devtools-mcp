# Chrome DevTools for agents

[![npm chrome-devtools-mcp package](https://img.shields.io/npm/v/chrome-devtools-mcp.svg)](https://npmjs.org/package/chrome-devtools-mcp)

Chrome DevTools for agents (`chrome-devtools-mcp`) lets your coding agent (such as Antigravity, Claude, Cursor or Copilot)
control and inspect a live Chrome browser. It is available as a
Model-Context-Protocol (MCP) server and as a [CLI][cli]. Both give your AI
coding assistant access to the full power of Chrome DevTools for reliable
automation, in-depth debugging, and performance analysis.

[Tool reference][tool-reference] | [CLI][cli] | [Skills][skills] | [Changelog][changelog] | [Contributing][contributing] | [Troubleshooting][troubleshooting] | [Design Principles][design-principles]

## Key features

- **Get performance insights**: Uses [Chrome
  DevTools](https://github.com/ChromeDevTools/devtools-frontend) to record
  traces and extract actionable performance insights.
- **Advanced browser debugging**: Analyze network requests, take screenshots and
  check browser console messages (with source-mapped stack traces).
- **Reliable automation**. Uses
  [puppeteer](https://github.com/puppeteer/puppeteer) to automate actions in
  Chrome and automatically wait for action results.

## Disclaimers

`chrome-devtools-mcp` exposes content of the browser instance to the MCP clients
allowing them to inspect, debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you don't want to share with
MCP clients.

`chrome-devtools-mcp` officially supports Google Chrome and [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/) only.
Other Chromium-based browsers may work, but this is not guaranteed, and you may encounter unexpected behavior. Use at your own discretion.
We are committed to providing fixes and support for the latest version of [Extended Stable Chrome](https://chromiumdash.appspot.com/schedule).

Performance tools may send trace URLs to the Google CrUX API to fetch real-user
experience data. This helps provide a holistic performance picture by
presenting field data alongside lab data. This data is collected by the [Chrome
User Experience Report (CrUX)](https://developer.chrome.com/docs/crux). To disable
this, run with the `--no-performance-crux` flag.

## **Usage statistics**

Google collects usage statistics (such as tool invocation success rates, latency, and environment information) to improve the reliability and performance of Chrome DevTools MCP.

Data collection is **enabled by default**. You can opt-out by passing the `--no-usage-statistics` flag when starting the server:

```json
"args": ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"]
```

Google handles this data in accordance with the [Google Privacy Policy](https://policies.google.com/privacy).

Google's collection of usage statistics for Chrome DevTools MCP is independent from the Chrome browser's usage statistics. Opting out of Chrome metrics does not automatically opt you out of this tool, and vice-versa.

Collection is disabled if `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` or `CI` env variables are set.

## Update checks

By default, the server periodically checks the npm registry for updates and logs a notification when a newer version is available.
You can disable these update checks by setting the `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` environment variable.

## Requirements

- [Node.js](https://nodejs.org/) [LTS](https://github.com/nodejs/Release#release-schedule) version.
- [Chrome](https://www.google.com/chrome/) current stable version or newer.
- [npm](https://www.npmjs.com/)

## Getting started

Add the following config to your MCP client:

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

> [!NOTE]
> Using `chrome-devtools-mcp@latest` ensures that your MCP client will always use the latest version of the Chrome DevTools MCP server.

### MCP Client configuration

For setup instructions specific to your editor or agent (e.g. Antigravity, Claude Code, Cursor, VS Code), please see our [Client Configurations Guide][client-configurations-guide].

### Your first prompt

Enter the following prompt in your MCP Client to check if everything is working:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should open the browser and record a performance trace.

> [!NOTE]
> The MCP server will start the browser automatically once the MCP client uses a tool that requires a running browser instance. Connecting to the Chrome DevTools MCP server on its own will not automatically start the browser.

## CLI

The package also includes the `chrome-devtools` CLI. Use it to control the browser from your terminal without MCP:

```sh
npm i chrome-devtools-mcp@latest -g
chrome-devtools navigate_page 1 --url "https://developers.chrome.com"
chrome-devtools take_screenshot 1 --filePath screenshot.png
chrome-devtools stop
```

See the [CLI guide][cli] for all commands and options.

## Skills

The package includes [skills](./skills) that teach your agent how to use Chrome DevTools:

| Skill                                                     | Use it to                                       |
| --------------------------------------------------------- | ----------------------------------------------- |
| [`chrome-devtools`](./skills/chrome-devtools)             | Debug and automate pages with the MCP tools.    |
| [`chrome-devtools-cli`](./skills/chrome-devtools-cli)     | Run the CLI and write shell scripts with it.    |
| [`a11y-debugging`](./skills/a11y-debugging)               | Audit and fix accessibility issues.             |
| [`cookie-debugging`](./skills/cookie-debugging)           | Debug cookies, sessions, and authentication.    |
| [`debug-optimize-lcp`](./skills/debug-optimize-lcp)       | Debug and improve Largest Contentful Paint.     |
| [`memory-leak-debugging`](./skills/memory-leak-debugging) | Find and fix memory leaks.                      |
| [`troubleshooting`](./skills/troubleshooting)             | Fix connection problems between MCP and Chrome. |

### Install skills as a plugin

A plugin installs the MCP server and all skills, including the CLI skill:

- **Claude Code:** Run `/plugin marketplace add ChromeDevTools/chrome-devtools-mcp`, then `/plugin install chrome-devtools-mcp@chrome-devtools-plugins`.
- **Copilot / VS Code:** Run **Chat: Install Plugin From Source** and enter `ChromeDevTools/chrome-devtools-mcp`.
- **Gemini CLI:** Run `gemini extensions install --auto-update https://github.com/ChromeDevTools/chrome-devtools-mcp`.

See the [Client Configurations Guide][client-configurations-guide] for more information.

### Install skills manually

If your agent does not support plugins, copy the skill folders into the skills directory of your agent. The npm package contains the skills:

```sh
npm i chrome-devtools-mcp@latest -g
# Example for Claude Code. Use the skills directory of your agent.
mkdir -p ~/.claude/skills
cp -R "$(npm root -g)/chrome-devtools-mcp/skills/chrome-devtools-cli" ~/.claude/skills/
```

> [!IMPORTANT]
> The `chrome-devtools-cli` skill requires the CLI. Install the package globally before you use the skill.

### Keep skills up to date

Skills describe the tools of a specific version. Update the skills each time you update the MCP server or the CLI. Outdated skills can tell your agent to use tools or parameters that changed.

- **Plugins:** Use the update command of the plugin manager of your agent. The Gemini CLI command above enables automatic updates with `--auto-update`.
- **Manual installs:** Update the package, then copy the skill folders again:

```sh
npm i chrome-devtools-mcp@latest -g
mkdir -p ~/.claude/skills
cp -R "$(npm root -g)/chrome-devtools-mcp/skills/chrome-devtools-cli" ~/.claude/skills/
```

## Tools

If you run into any issues, checkout our [troubleshooting guide][troubleshooting].
See the full [Tool Reference][tool-reference] for a complete list of all supported MCP capabilities.

## Configuration

Find the complete list of server parameters (e.g., `--headless`, `--isolated`, `--slim`) and how to configure WebSocket connections in the [Configuration Guide][configuration-guide].

For basic browser tasks only, the `--slim` flag exposes a reduced set of tools. See the [Slim tool reference][slim-tool-reference].

## Advanced Usage

For advanced features such as handling concurrent sessions, persistent user data directories, connecting to a running Chrome instance instead of starting a new one, or debugging on Android, see our [Advanced Usage Guide][advanced-usage-guide].

## Integrating as a browser subagent

If you are developing agentic tooling and want to provide an integrated browser subagent as part of your product, we recommend building on top of Chrome DevTools for agents.

For a reference implementation, see the [Gemini CLI browser agent documentation](https://geminicli.com/docs/core/subagents/#browser-agent).

[advanced-usage-guide]: ./docs/advanced-usage.md
[changelog]: ./CHANGELOG.md
[cli]: ./docs/cli.md
[client-configurations-guide]: ./docs/client-configurations.md
[configuration-guide]: ./docs/configuration.md
[contributing]: ./CONTRIBUTING.md
[design-principles]: ./docs/design-principles.md
[skills]: #skills
[slim-tool-reference]: ./docs/slim-tool-reference.md
[tool-reference]: ./docs/tool-reference.md
[troubleshooting]: ./docs/troubleshooting.md
