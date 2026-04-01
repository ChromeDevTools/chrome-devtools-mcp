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

## Development process

### Code reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult
[GitHub Help](https://help.github.com/articles/about-pull-requests/) for more
information on using pull requests.

### Conventional commits

Please follow [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
for PR and commit titles.

### Feature release checklist

Use `chore:` for commits containing incomplete features that are not available
to users yet. Once the feature is ready to be released, create a PR with a
`feat:` prefix that enables the feature. The following criteria need to be
completed:

- Documentation for the feature is up to date. For example, README.md and tools
  reference are updated.
- The feature can be used with Chrome stable or version restrictions are
  documented otherwise.
- Corresponding skills are updated or new skills are added if needed.
- The feature fulfills the use case by its own or in conjunction with existing
  features (we want to avoid features that offer some tools but cannot be used
  successfully to debug things).

### Release process

Releasing `chrome-devtools-mcp` is automated by GitHub Actions. To release a new
version, [search for a PR titled `chore(main): release chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp/pulls?q=is%3Apr+is%3Aopen+%22chore%28main%29%3A+release+chrome-devtools-mcp%22)
and review, test, and land it. The release PR is automatically opened if there
are any changes on the main branch that show up in the changelog.

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
npx @modelcontextprotocol/inspector node /build/src/bin/chrome-devtools-mcp.js
```

### Testing with an MCP client

Add the MCP server to your client's config.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path-to/build/src/bin/chrome-devtools-mcp.js"]
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
npx @modelcontextprotocol/inspector node /build/src/bin/chrome-devtools-mcp.js --log-file=/your/desired/path/log.txt
```

You can use the `DEBUG` environment variable as usual to control categories that are logged.

### Updating documentation

When adding a new tool or updating a tool name or description, make sure to run `npm run gen` to generate the tool reference documentation.

### Contributing to Evals

We use Gemini to evaluate the MCP server tools in `scripts/eval_scenarios`.
Each scenario is a TypeScript file that exports a `scenario` object implementing `TestScenario`.

- **prompt**: The prompt to send to the model.
- **maxTurns**: Maximum number of conversation turns.
- **expectations**: A function that verifies the tool calls made by the model.
- **htmlRoute** (Optional): Serve custom HTML content for the test at a specific path.

We look to test that the tools are used correctly without too rigid assertions. Avoid asserting exact argument values if they can vary (e.g., natural language reasoning), but ensure the core parameters (like URLs or selectors) were correct.

Example:

```ts
import {TestScenario} from '../eval_gemini.js';

export const scenario: TestScenario = {
  prompt: 'Navigate to example.com',
  maxTurns: 2,
  expectations: calls => {
    // Check that at least one call was 'browse_page'
    const navigation = calls.find(c => c.name === 'browse_page');
    if (!navigation) throw new Error('Model did not browse the page');
    // Verify essential args
    if (navigation.args.url !== 'http://example.com') {
      throw new Error(`Wrong URL: ${navigation.args.url}`);
    }
  },
};
```

## Restrictions on JSON schema

- no .nullable(), no .object() types. Enforced by the `@local/enforce-zod-schema` ESLint rule.
- represent complex object as a short formatted string.
