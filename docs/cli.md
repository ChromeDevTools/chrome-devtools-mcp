# Brave DevTools CLI

The `brave-devtools-mcp` package includes an **experimental** CLI interface that allows you to interact with the browser directly from your terminal. This is particularly useful for debugging or when you want an agent to generate scripts that automate browser actions.

## Getting started

Install the package globally to make the `brave-devtools` command available:

```sh
npm i brave-devtools-mcp@latest -g
brave-devtools status # check if install worked.
```

## How it works

The CLI acts as a client to a background `brave-devtools-mcp` daemon (uses Unix sockets on Linux/Mac and named pipes on Windows).

- **Automatic Start**: The first time you call a tool (e.g., `list_pages`), the CLI automatically starts the MCP server and the browser in the background if they aren't already running.
- **Persistence**: The same background instance is reused for subsequent commands, preserving the browser state (open pages, cookies, etc.).
- **Manual Control**: You can explicitly manage the background process using `start`, `stop`, and `status`. The `start` command forwards all subsequent arguments to the underlying MCP server (e.g., `--headless`, `--userDataDir`) but not all args are supported. Run `brave-devtools start --help` for supported args. Headless is enabled by default. Isolated is enabled by default unless `--userDataDir` is provided.

```sh
# Check if the daemon is running
brave-devtools status

# Navigate the current page to a URL
brave-devtools navigate_page url --url "https://google.com"

# Take a screenshot and save it to a file
brave-devtools take_screenshot --filePath screenshot.png

# Stop the background daemon when finished
brave-devtools stop
```

## Command Usage

The CLI only supports tools available in the MCP server without additional arguments (see [Tool reference](./tool-reference.md)).
Thus, `--categoryExtensions` tools are currently not available in the CLI.

```sh
brave-devtools <tool> [arguments] [flags]
```

- **Required Arguments**: Passed as positional arguments.
- **Optional Arguments**: Passed as flags (e.g., `--filePath`, `--fullPage`).

### Examples

**New Page and Navigation:**

```sh
brave-devtools new_page "https://example.com"
brave-devtools navigate_page url --url "https://web.dev"
```

**Interaction:**

```sh
# Click an element by its UID from a snapshot
brave-devtools click "element-uid-123"

# Fill a form field
brave-devtools fill "input-uid-456" "search query"
```

**Analysis:**

```sh
# Run a Lighthouse audit (defaults to navigation mode)
brave-devtools lighthouse_audit --mode snapshot
```

## Output format

By default, the CLI outputs a human-readable summary of the tool's result. For programmatic use, you can request raw JSON:

```sh
brave-devtools list_pages --output-format=json
```

## Troubleshooting

If the CLI hangs or fails to connect, try stopping the background process:

```sh
brave-devtools stop
```

For more verbose logs, set the `DEBUG` environment variable:

```sh
DEBUG=* brave-devtools list_pages
```

## CLI generation

Implemented in `scripts/generate-cli.ts`. Some commands are excluded from CLI
generation such as `wait_for` and `fill_form`.

`brave-devtools-mcp` args are also filtered in `src/bin/brave-devtools.ts`
because not all args make sense in a CLI interface.
