# Chrome DevTools CLI

The `chrome-devtools-mcp` package includes an **experimental** CLI interface that allows you to interact with the browser directly from your terminal. This is particularly useful for debugging or when you want an agent to generate scripts that automate browser actions.

## Getting started

Install the package globally to make the `chrome-devtools` command available:

```sh
npm i chrome-devtools-mcp@latest -g
chrome-devtools status # check if install worked.
```

## How it works

The CLI acts as a client to a background `chrome-devtools-mcp` daemon (uses Unix sockets on Linux/Mac and named pipes on Windows).

- **Automatic Start**: The first time you call a tool (e.g., `list_pages`), the CLI automatically starts the MCP server and the browser in the background if they aren't already running.
- **Persistence**: The same background instance is reused for subsequent commands, preserving the browser state (open pages, cookies, etc.).
- **Manual Control**: You can explicitly manage the background process using `start`, `stop`, and `status`. The `start` command forwards all subsequent arguments to the underlying MCP server (e.g., `--headless`, `--userDataDir`) but not all args are supported. Run `chrome-devtools start --help` for supported args. Headless is enabled by default. Isolated is enabled by default unless `--userDataDir` is provided.

```sh
# Check if the daemon is running
chrome-devtools status

# Navigate the current page to a URL
chrome-devtools navigate_page "https://google.com"

# Take a screenshot and save it to a file
chrome-devtools take_screenshot --filePath screenshot.png

# Stop the background daemon when finished
chrome-devtools stop
```

## Command Usage

The CLI supports all tools available in the [Tool reference](./tool-reference.md).

```sh
chrome-devtools <tool> [arguments] [flags]
```

- **Required Arguments**: Passed as positional arguments.
- **Optional Arguments**: Passed as flags (e.g., `--filePath`, `--fullPage`).

### Examples

**New Page and Navigation:**

```sh
chrome-devtools new_page "https://example.com"
chrome-devtools navigate_page "https://web.dev" --type url
```

**Interaction:**

```sh
# Click an element by its UID from a snapshot
chrome-devtools click "element-uid-123"

# Fill a form field
chrome-devtools fill "input-uid-456" "search query"
```

**Analysis:**

```sh
# Run a Lighthouse audit (defaults to navigation mode)
chrome-devtools lighthouse_audit --mode snapshot
```

## Output format

By default, the CLI outputs a human-readable summary of the tool's result. For programmatic use, you can request raw JSON:

```sh
chrome-devtools list_pages --output-format=json
```

## Troubleshooting

If the CLI hangs or fails to connect, try stopping the background process:

```sh
chrome-devtools stop
```

For more verbose logs, set the `DEBUG` environment variable:

```sh
DEBUG=* chrome-devtools list_pages
```

## CLI generation

Implemented in `scripts/generate-cli.ts`. Some commands are excluded from CLI
generation such as `wait_for` and `fill_form`.

`chrome-devtools-mcp` args are also filtered in `src/bin/chrome-devtools.ts`
because not all args make sense in a CLI interface.
