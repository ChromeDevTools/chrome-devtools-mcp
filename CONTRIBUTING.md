# How to contribute

We'd love to accept your patches and contributions to this project.

This is a fork of [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) by Google, enhanced with Chrome extension development features.

## Before you begin

### Contributing Guidelines

This fork focuses on Chrome extension development features. When contributing:

- Ensure changes maintain compatibility with the original Chrome DevTools MCP functionality
- New features should enhance Chrome extension development workflow
- Follow the same coding standards as the original project

## Contribution process

### Code reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult
[GitHub Help](https://help.github.com/articles/about-pull-requests/) for more
information on using pull requests.

### Conventional commits

Please follow [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
for PR and commit titles.

## Installation

```sh
git clone https://github.com/usedhonda/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm ci
npm run build
```

### Testing with @modelcontextprotocol/inspector

```sh
npx @modelcontextprotocol/inspector node build/src/index.js
```

### Testing with an MCP client

Add the MCP server to your global MCP configuration at `~/.claude.json`:

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-devtools-mcp/build/src/index.js"]
    }
  }
}
```

**Note:** This uses the local build for development. For end-users, the configuration would use `npx` with the published package instead.

#### Using with VS Code SSH

When running the `@modelcontextprotocol/inspector` it spawns 2 services - one on port `6274` and one on `6277`.
Usually VS Code automatically detects and forwards `6274` but fails to detect `6277` so you need to manually forward it.

### Debugging

To write debug logs to `log.txt` in the working directory, run with the following commands:

```sh
npx @modelcontextprotocol/inspector node build/src/index.js --log-file=/your/desired/path/log.txt
```

You can use the `DEBUG` environment variable as usual to control categories that are logged.

### Updating documentation

When adding a new tool or updating a tool name or description, make sure to run `npm run docs` to generate the tool reference documentation.
