# How to contribute

We'd love to accept your patches and contributions to this project.

## Before you begin

### Sign our Contributor License Agreement

Contributions to this project must be accompanied by a
[Contributor License Agreement](https://cla.developers.google.com/about) (CLA).
You (or your employer) retain the copyright to your contribution; this simply
gives us permission to use and redistribute your contributions as part of the
project.

If you or your current employer have already signed the Google CLA (even if it
was for a different project), you probably don't need to do it again.

Visit <https://cla.developers.google.com/> to see your current agreements or to
sign a new one.

### Review our community guidelines

This project follows
[Google's Open Source Community Guidelines](https://opensource.google/conduct/).

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

Check that you are using node version specified in .nvmrc, then run following commands:

```sh
git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm ci
npm run build
```

### Testing with @modelcontextprotocol/inspector

```sh
npx @modelcontextprotocol/inspector node build/src/index.js
```

### Testing with an MCP client

Add the MCP server to your client's config.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path-to/build/src/index.js"]
    }
  }
}
```

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
