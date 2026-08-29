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

# Navigate page 1 to a URL
chrome-devtools navigate_page 1 --url "https://google.com"

# Take a screenshot of page 1 and save it to a file
chrome-devtools take_screenshot 1 --filePath screenshot.png

# Stop the background daemon when finished
chrome-devtools stop
```

## Startup defaults

You can persist options used to start the daemon in an XDG-compatible configuration file at `$XDG_CONFIG_HOME/chrome-devtools/config.json`, or `~/.config/chrome-devtools/config.json` when `XDG_CONFIG_HOME` is not set.

The file contains a JSON object whose keys match the options accepted by `chrome-devtools start`. Run `chrome-devtools start --help` for the supported options.

```json
{
  "executablePath": "/usr/bin/chromium",
  "headless": false
}
```

These defaults apply both when a tool command automatically starts the daemon and when `chrome-devtools start` is invoked explicitly. Precedence is:

```text
explicit command-line options > configuration file > built-in defaults
```

`chrome-devtools status` reports the effective daemon arguments after this merge.

## Command Usage

The CLI only supports tools available in the MCP server without additional arguments (see [Tool reference](./tool-reference.md)).
Thus, `--categoryExtensions` tools are currently not available in the CLI.

```sh
chrome-devtools <tool> [arguments] [flags]
```

- **Required Arguments**: Passed as positional arguments. Page-scoped tools require `<pageId>` as their first positional argument.
- **Optional Arguments**: Passed as flags (e.g., `--filePath`, `--fullPage`).

### Examples

**New Page and Navigation:**

```sh
chrome-devtools new_page "https://example.com"
chrome-devtools navigate_page 1 --url "https://web.dev"
```

**Interaction:**

```sh
# Click an element by its UID from a snapshot on page 1
chrome-devtools click 1 "element-uid-123"

# Fill a form field on page 1
chrome-devtools fill 1 "input-uid-456" "search query"
```

**Script Evaluation:**

- When `--categoryExtensions` and `--pageIdRouting` are enabled:
  - Target a page using `--pageId <number>`: `chrome-devtools evaluate_script "() => document.title" --pageId 1`
  - Target an extension service worker using `--serviceWorkerId <string>`: `chrome-devtools evaluate_script "() => self.registration.scope" --serviceWorkerId sw-1`

```sh
# Evaluate a JavaScript expression on page 1
chrome-devtools evaluate_script "() => document.title" --pageId 1

# Evaluate inside an extension service worker
chrome-devtools evaluate_script "() => self.registration.scope" --serviceWorkerId sw-1
```

**Analysis:**

```sh
# Run a Lighthouse audit on page 1 (defaults to navigation mode)
chrome-devtools lighthouse_audit 1 --mode snapshot
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
