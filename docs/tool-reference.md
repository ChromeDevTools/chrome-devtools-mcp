<!-- AUTO GENERATED DO NOT EDIT - run 'pnpm run docs' to update-->

# VS Code DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (8 tools)
  - [`keyboard_hotkey`](#keyboard_hotkey)
  - [`keyboard_type`](#keyboard_type)
  - [`mouse_click`](#mouse_click)
  - [`mouse_drag`](#mouse_drag)
  - [`mouse_hover`](#mouse_hover)
  - [`mouse_scroll`](#mouse_scroll)
  - [`terminal_input`](#terminal_input)
  - [`wait`](#wait)
- **[Debugging](#debugging)** (4 tools)
  - [`read_console`](#read_console)
  - [`read_output`](#read_output)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)
- **[Development diagnostics](#development-diagnostics)** (3 tools)
  - [`read_terminal`](#read_terminal)
  - [`terminal_kill`](#terminal_kill)
  - [`terminal_run`](#terminal_run)
- **[Codebase analysis](#codebase-analysis)** (1 tools)
  - [`codebase_overview`](#codebase_overview)

## Input automation

### `keyboard_hotkey`

**Description:** Press a key or key combination. Use this when other input methods like [`keyboard_type`](#keyboard_type)() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

Args:
  - key (string): Key or combination (e.g., "Enter", "Control+A", "Control+Shift+R")
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'hotkey', key: string, success: true, changes?: string }
  Markdown format: Changes detected + key pressed confirmation

Examples:
  - "Press Enter" -> { key: "Enter" }
  - "Select all" -> { key: "Control+A" }
  - "Hard refresh" -> { key: "Control+Shift+R" }

**Parameters:**

- **includeSnapshot** (unknown) **(required)**: Whether to include a snapshot in the response. Default is false.
- **key** (unknown) **(required)**: A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `keyboard_type`

**Description:** Type text into a input, text area or select an option from a &lt;select&gt; element.

By default, text is inserted at the current cursor position without clearing existing content,
just like a normal keyboard. Set `clear` to true to replace all existing content first.

Args:
  - uid (string): Element uid from page snapshot
  - value (string): Text to type or option to select
  - clear (boolean): Clear existing content before typing. Default: false
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'type', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

**Parameters:**

- **clear** (unknown) **(required)**: Clear existing content before typing. Default: false. When false, text is inserted at the current cursor position like a normal keyboard.
- **includeSnapshot** (unknown) **(required)**: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **uid** (unknown) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (unknown) **(required)**: The value to fill in

---

### `mouse_click`

**Description:** Clicks on the provided element.

Args:
  - uid (string): Element uid from page snapshot
  - dblClick (boolean): Double click. Default: false
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'click', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

Examples:
  - "Click button" -> { uid: "abc123" }
  - "Double click" -> { uid: "abc123", dblClick: true }

**Parameters:**

- **dblClick** (unknown) **(required)**: Set to true for double clicks. Default is false.
- **includeSnapshot** (unknown) **(required)**: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **uid** (unknown) **(required)**: The uid of an element on the page from the page content snapshot

---

### `mouse_drag`

**Description:** Drag an element onto another element.

Args:
  - from_uid (string): Element uid to drag
  - to_uid (string): Element uid to drop onto
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'drag', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

**Parameters:**

- **from_uid** (unknown) **(required)**: The uid of the element to drag
- **includeSnapshot** (unknown) **(required)**: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **to_uid** (unknown) **(required)**: The uid of the element to drop into

---

### `mouse_hover`

**Description:** Hover over the provided element.

Args:
  - uid (string): Element uid from page snapshot
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'hover', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

**Parameters:**

- **includeSnapshot** (unknown) **(required)**: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **uid** (unknown) **(required)**: The uid of an element on the page from the page content snapshot

---

### `mouse_scroll`

**Description:** Scroll an element into view, or scroll within a scrollable element in a given direction. If no direction is provided, the element is simply scrolled into the viewport.

Args:
  - uid (string): Element uid from page snapshot
  - direction ('up'|'down'|'left'|'right'): Scroll direction. Optional
  - amount (number): Scroll distance in pixels. Default: 300
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'scroll', direction?, amount?, success: true, changes?: string }
  Markdown format: Changes detected + scroll confirmation

Examples:
  - "Scroll element into view" -> { uid: "abc123" }
  - "Scroll down 500px" -> { uid: "abc123", direction: "down", amount: 500 }

**Parameters:**

- **amount** (unknown) **(required)**: Scroll distance in pixels. Default is 300.
- **direction** (unknown) **(required)**: Direction to scroll within the element. If omitted, the element is scrolled into view without additional scrolling.
- **includeSnapshot** (unknown) **(required)**: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **uid** (unknown) **(required)**: The uid of an element on the page from the page content snapshot

---

### `terminal_input`

**Description:** Send input to a terminal that is waiting for user input.

Use this after [`terminal_run`](#terminal_run) returns status "waiting_for_input" (e.g., answering
a [Y/n] prompt, entering a password, or providing interactive input).

After sending the input, waits for the next completion or prompt.

Args:
  - text (string): The text to send to the terminal
  - addNewline (boolean): Whether to press Enter after the text. Default: true
  - timeout (number): Max [`wait`](#wait) time in milliseconds. Default: 30000
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  Same as [`terminal_run`](#terminal_run) — status, output, exitCode, prompt, pid, name

Examples:
  - Answer yes: { text: "y" }
  - Enter a value: { text: "my-project-name" }
  - Send without Enter: { text: "partial", addNewline: false }
  - Named terminal: { text: "y", name: "dev-server" }
  - Detailed log compression: { text: "y", logFormat: "detailed" }

**Parameters:**

- **addNewline** (unknown) **(required)**: Whether to press Enter after the text. Default: true. Set to false for partial input or when Enter should not be sent.
- **logFormat** (unknown) **(required)**: Log compression format. 'summary' (default): compact overview with top templates + rare events. 'detailed': full template list with sample variables &amp; metadata (URLs, status codes, durations). 'json': machine-readable JSON with complete template data.
- **name** (unknown) **(required)**: Optional terminal name. Each named terminal runs independently with its own state and output history. Default: "default". Use different names to run multiple commands concurrently.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **text** (unknown) **(required)**: The text to send to the terminal. For interactive prompts, this is typically "y", "n", a filename, a version number, etc.
- **timeout** (unknown) **(required)**: Maximum [`wait`](#wait) time in milliseconds after sending input. Default: 30000.

---

### `wait`

**Description:** [`Wait`](#wait) for a specified duration before continuing. Useful for giving the page time to update, animations to complete, or network requests to settle.

Args:
  - durationMs (number): Duration in milliseconds (0-30000)
  - reason (string): Optional explanation for the [`wait`](#wait)
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { elapsed_ms, requested_ms, reason? }
  Markdown format: "Waited Xms" or "Waited Xms (reason)"

Examples:
  - "[`Wait`](#wait) for animation" -> { durationMs: 500, reason: "animation to complete" }
  - "[`Wait`](#wait) for API response" -> { durationMs: 2000, reason: "network request to settle" }

Error Handling:
  - Duration must be between 0 and 30000ms

**Parameters:**

- **durationMs** (unknown) **(required)**: Duration to [`wait`](#wait) in milliseconds. Must be between 0 and 30000 (30 seconds).
- **reason** (unknown) **(required)**: Optional reason for waiting (e.g., "waiting for animation to complete"). Included in the response for context.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

## Debugging

### `read_console`

**Description:** Read console messages with full control over filtering and detail level.

**FILTERING OPTIONS:**

- `limit` (number): Get the N most recent messages. Default: all messages
- `types` (string[]): Filter by log type: 'error', 'warning', 'info', 'debug', 'log', 'trace', etc.
- `pattern` (string): Regex pattern to match against message text
- `sourcePattern` (string): Regex pattern to match against source URLs in stack traces
- `afterId` (number): Only messages after this ID (for incremental reads - avoids re-reading)
- `beforeId` (number): Only messages before this ID

**DETAIL CONTROL (reduce context size):**

- `fields` (string[]): Which fields to include. Options: 'id', 'type', 'text', 'timestamp', 'stackTrace', 'args'. Default: ['id', 'type', 'text']
- `textLimit` (number): Max characters per message text (truncates with "..."). Default: unlimited
- `stackDepth` (number): Max stack frames to include per message. Default: 1. Set 0 to exclude.

**EXAMPLES:**

Minimal error scan (smallest context):
  { types: ['error'], limit: 20, fields: ['id', 'text'], textLimit: 100 }

Full error details:
  { types: ['error'], limit: 5, fields: ['id', 'type', 'text', 'args', 'stackTrace'], stackDepth: 5 }

Incremental read (only new messages since last read):
  { afterId: 42 }

Find specific pattern:
  { pattern: "TypeError|ReferenceError", limit: 10 }

Warnings from specific source:
  { types: ['warning'], sourcePattern: "extension\\.ts" }

**RESPONSE METADATA:**

Returns: { total, returned, hasMore, oldestId?, newestId?, messages: [...] }
- `total`: Total messages matching filters (before limit applied)
- `hasMore`: Whether there are older messages not returned (use limit or afterId to get more)
- `oldestId`/`newestId`: ID range in response (use newestId as afterId for next incremental read)

**Parameters:**

- **afterId** (unknown) **(required)**: Only return messages with ID greater than this (for incremental reads).
- **beforeId** (unknown) **(required)**: Only return messages with ID less than this.
- **fields** (unknown) **(required)**: Which fields to include per message. Default: [id, type, text]. Options: id, type, text, timestamp, stackTrace, args
- **limit** (unknown) **(required)**: Get the N most recent messages. Omit to get all messages.
- **logFormat** (unknown) **(required)**: Log compression format. 'summary' (default): compact overview with top templates + rare events. 'detailed': full template list with sample variables &amp; metadata (URLs, status codes, durations). 'json': machine-readable JSON with complete template data.
- **msgid** (unknown) **(required)**: Get a specific message by ID with full details.
- **pattern** (unknown) **(required)**: Regex pattern to match against message text (case-insensitive).
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **sourcePattern** (unknown) **(required)**: Regex pattern to match against source URLs in stack traces.
- **stackDepth** (unknown) **(required)**: Max stack frames to include. Default: 1. Set 0 to exclude stack traces entirely.
- **textLimit** (unknown) **(required)**: Max characters per message text. Longer messages are truncated with "...".
- **types** (unknown) **(required)**: Filter by log types: error, warning, info, debug, log, trace, etc.

---

### `read_output`

**Description:** Read VS Code output logs from the workspace session. When called without a channel, lists all available output channels. When called with a channel name, returns log content with optional filtering.

**LISTING CHANNELS (no channel provided):**

Returns all available output channels organized by category.

**READING CHANNEL CONTENT (channel provided):**

**FILTERING OPTIONS:**

- `limit` (number): Get the N most recent lines. Default: all lines
- `pattern` (string): Regex pattern to match against line content (case-insensitive)
- `afterLine` (number): Only lines after this line number (for incremental reads - avoids re-reading)
- `beforeLine` (number): Only lines before this line number

**DETAIL CONTROL (reduce context size):**

- `lineLimit` (number): Max characters per line (truncates with "..."). Default: unlimited

**EXAMPLES:**

List all channels:
  {}

Read extension host logs:
  { channel: "exthost" }

Get last 50 lines:
  { channel: "exthost", limit: 50 }

Find errors in logs:
  { channel: "main", pattern: "error|exception|failed", limit: 100 }

Incremental read (only new lines since last read):
  { channel: "Git", afterLine: 150 }

Truncate long lines:
  { channel: "exthost", limit: 30, lineLimit: 200 }

**RESPONSE METADATA (content mode):**

Returns: { mode: 'content', channel, total, returned, hasMore, oldestLine?, newestLine?, lines: [...] }
- `total`: Total lines matching filters (before limit applied)
- `hasMore`: Whether there are older lines not returned
- `oldestLine`/`newestLine`: Line range in response (use newestLine as afterLine for next incremental read)

**ERROR HANDLING:**
- Returns "No logs directory found." if VS Code debug window isn't running
- Returns "Channel X not found." with available channels if channel doesn't exist

**Parameters:**

- **afterLine** (unknown) **(required)**: Only return lines with line number greater than this (for incremental reads).
- **beforeLine** (unknown) **(required)**: Only return lines with line number less than this.
- **channel** (unknown) **(required)**: Name of the output channel to read (e.g., "exthost", "main", "Git"). If omitted, lists all available channels.
- **limit** (unknown) **(required)**: Get the N most recent lines. Omit to get all lines.
- **lineLimit** (unknown) **(required)**: Max characters per line. Longer lines are truncated with "...".
- **logFormat** (unknown) **(required)**: Log compression format. 'summary' (default): compact overview with top templates + rare events. 'detailed': full template list with sample variables &amp; metadata (URLs, status codes, durations). 'json': machine-readable JSON with complete template data.
- **pattern** (unknown) **(required)**: Regex pattern to match against line content (case-insensitive).
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

Args:
  - format ('png'|'jpeg'|'webp'): Image format. Default: 'png'
  - quality (number): Compression quality for JPEG/WebP (0-100). Ignored for PNG
  - uid (string): Element uid to screenshot. Omit for full page/viewport
  - fullPage (boolean): Screenshot full page instead of viewport. Incompatible with uid
  - filePath (string): Save to file path instead of attaching inline
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, type, format, savedTo?, sizeBytes?, attached? }
  Markdown format: Description + inline image or file save confirmation

Examples:
  - "Screenshot viewport" -> {}
  - "Screenshot full page" -> { fullPage: true }
  - "Screenshot element" -> { uid: "abc123" }
  - "Save as JPEG" -> { format: "jpeg", quality: 80, filePath: "shot.jpg" }

Error Handling:
  - Throws if both uid and fullPage are provided
  - Auto-saves to file if image > 2MB

**Parameters:**

- **filePath** (unknown) **(required)**: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (unknown) **(required)**: Type of format to save the screenshot as. Default is "png"
- **fullPage** (unknown) **(required)**: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (unknown) **(required)**: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **uid** (unknown) **(required)**: The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

The snapshot also includes a list of all CDP targets (pages, iframes, webviews, service workers)
available for debugging, so you always know what targets exist.

Args:
  - verbose (boolean): Include full a11y tree details. Default: false
  - filePath (string): Save to file instead of returning inline
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, savedTo?, snapshot?, elementCount? }
  Markdown format: "## Latest page snapshot" + formatted tree

Examples:
  - "Take snapshot" -> {}
  - "Verbose snapshot" -> { verbose: true }
  - "Save to file" -> { filePath: "snapshot.txt" }

Error Handling:
  - Returns error if response exceeds 25000 chars (use filePath for large pages)

**Parameters:**

- **filePath** (unknown) **(required)**: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **verbose** (unknown) **(required)**: Whether to include all possible information available in the full a11y tree. Default is false.

---

## Development diagnostics

### `read_terminal`

**Description:** Read the current output and state of any tracked terminal.

Use this to:
- Check if a previously started command has finished
- See the latest output from a running or completed process
- Determine if the terminal is waiting for input
- Search terminal output for specific patterns
- Get just the last N lines of output

Args:
  - name (string): Terminal name. Default: 'default'
  - limit (number): Return only the last N lines of output
  - pattern (string): Regex pattern to filter output lines (case-insensitive)
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'idle' (no terminal), 'running', 'completed', or 'waiting_for_input'
  - output: Terminal output (optionally filtered)
  - exitCode: Process exit code (if completed)
  - prompt: Detected prompt (if waiting for input)
  - pid: Process ID
  - name: Terminal name

Examples:
  - Check default terminal: {}
  - Check named terminal: { name: "dev-server" }
  - Last 20 lines: { limit: 20 }
  - Find errors: { pattern: "error|fail|exception", limit: 50 }
  - Named terminal + filter: { name: "build", pattern: "warning", limit: 100 }

**Parameters:**

- **limit** (unknown) **(required)**: Return only the last N lines of output. Omit to get all output.
- **logFormat** (unknown) **(required)**: Log compression format. 'summary' (default): compact overview with top templates + rare events. 'detailed': full template list with sample variables &amp; metadata (URLs, status codes, durations). 'json': machine-readable JSON with complete template data.
- **name** (unknown) **(required)**: Optional terminal name. Each named terminal runs independently with its own state and output history. Default: "default". Use different names to run multiple commands concurrently.
- **pattern** (unknown) **(required)**: Regex pattern to filter output lines (case-insensitive).
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `terminal_kill`

**Description:** Send Ctrl+C to stop the running process in a terminal.

Use this when:
- A command is taking too long
- You need to cancel a running process before starting a new one
- [`terminal_run`](#terminal_run) returned status "running" (timed out without completing)

The terminal itself is preserved for reuse — only the running process is interrupted.

Args:
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'completed' (after Ctrl+C)
  - output: Final terminal output
  - pid: Process ID
  - name: Terminal name

**Parameters:**

- **logFormat** (unknown) **(required)**: Log compression format. 'summary' (default): compact overview with top templates + rare events. 'detailed': full template list with sample variables &amp; metadata (URLs, status codes, durations). 'json': machine-readable JSON with complete template data.
- **name** (unknown) **(required)**: Optional terminal name. Each named terminal runs independently with its own state and output history. Default: "default". Use different names to run multiple commands concurrently.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `terminal_run`

**Description:** Run a PowerShell command in the VS Code terminal from a specific working directory.

`cwd` (absolute path) is REQUIRED. All commands run in PowerShell.

By default (waitMode: 'completion'), the tool BLOCKS until the command fully completes,
including a 3-second grace period to catch cascading commands. This means you get the
complete output in a single call without needing to poll [`read_terminal`](#read_terminal).

If the command asks for user input (e.g., [Y/n] prompts), it returns immediately
with status "waiting_for_input" and the detected prompt. Use [`terminal_input`](#terminal_input) to respond.

For long-running dev servers, use waitMode: 'background' to return immediately.

**Response always includes:**
- The working directory the command ran from
- (Via process ledger) A full inventory of all open terminal sessions

Args:
  - cwd (string): **REQUIRED.** Absolute path to the working directory.
  - command (string): The PowerShell command to execute.
  - timeout (number): Max [`wait`](#wait) time in milliseconds. Default: 120000 (2 minutes)
  - name (string): Terminal name for multi-terminal support. Default: 'default'
  - waitMode ('completion'|'background'): Default 'completion' blocks until done
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  - status: 'completed' | 'running' | 'waiting_for_input' | 'timeout'
  - shell: Always 'powershell'
  - output: Terminal output text
  - cwd: The working directory the command ran from
  - exitCode: Process exit code (when completed)
  - prompt: Detected prompt text (when waiting_for_input)
  - pid: Process ID
  - name: Terminal name
  - durationMs: How long the command ran

Examples:
  - Build: { cwd: "C:\\project", command: "npm run build" }
  - Dev server: { cwd: "C:\\app", command: "npm run dev", waitMode: "background" }

**Parameters:**

- **command** (unknown) **(required)**: The PowerShell command to execute.
- **cwd** (unknown) **(required)**: **REQUIRED.** Absolute path to the working directory. The command will execute from this directory to ensure deterministic behavior.
- **logFormat** (unknown) **(required)**: Log compression format. 'summary' (default): compact overview with top templates + rare events. 'detailed': full template list with sample variables &amp; metadata (URLs, status codes, durations). 'json': machine-readable JSON with complete template data.
- **name** (unknown) **(required)**: Optional terminal name. Each named terminal runs independently with its own state and output history. Default: "default". Use different names to run multiple commands concurrently.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **timeout** (unknown) **(required)**: Maximum [`wait`](#wait) time in milliseconds for the command to complete. Default: 120000 (2 minutes). For long-running commands, increase this value.
- **waitMode** (unknown) **(required)**: [`Wait`](#wait) mode: 'completion' (default) blocks until command finishes; 'background' returns immediately for long-running processes like dev servers.

---

## Codebase analysis

### `codebase_overview`

**Description:** Get a structural overview of the codebase as a file tree with optional symbol nesting.

Shows the project's directory structure with progressively deeper detail controlled by the
`depth` parameter:
- `depth: 0` — File tree only (directories and filenames)
- `depth: 1` — Top-level symbols per file (functions, classes, interfaces, enums, constants)
- `depth: 2` — Members inside containers (class methods, interface fields, enum members)
- `depth: 3+` — Deeper nesting (parameters, inner types, nested definitions)

Use this as the FIRST tool call when exploring an unfamiliar codebase. It provides the
structural orientation needed to know what exists and where before using more targeted
tools like codebase_trace_symbol or codebase_exports.

**Examples:**
- Full project map with top-level symbols: `{}`
- Focus on a subdirectory: `{ filter: "src/tools/**" }`
- Deep dive into class internals: `{ filter: "src/tools/**", depth: 3 }`
- Quick file listing: `{ depth: 0 }`
- With imports and line counts: `{ includeImports: true, includeStats: true }`

**Parameters:**

- **depth** (unknown) **(required)**: Symbol nesting depth per file. 0=files only, 1=top-level symbols, 2=class members, 3+=deeper nesting.
- **filter** (unknown) **(required)**: Glob pattern to include only matching files (e.g., "src/tools/**").
- **includeImports** (unknown) **(required)**: Include import module specifiers per file.
- **includeStats** (unknown) **(required)**: Include line counts per file and diagnostic counts.
- **response_format** (unknown) **(required)**: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **rootDir** (unknown) **(required)**: Absolute path to the project root. Defaults to the workspace root.

---
