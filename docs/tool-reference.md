<!-- AUTO GENERATED DO NOT EDIT - run 'pnpm run docs' to update-->

# VS Code DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (7 tools)
  - [`keyboard_hotkey`](#keyboard_hotkey)
  - [`keyboard_type`](#keyboard_type)
  - [`mouse_click`](#mouse_click)
  - [`mouse_drag`](#mouse_drag)
  - [`mouse_hover`](#mouse_hover)
  - [`mouse_scroll`](#mouse_scroll)
  - [`wait`](#wait)
- **[Debugging](#debugging)** (6 tools)
  - [`invoke_vscode_api`](#invoke_vscode_api)
  - [`invoke_vscode_command`](#invoke_vscode_command)
  - [`read_console`](#read_console)
  - [`read_output`](#read_output)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

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

- **key** (string) **(required)**: A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `keyboard_type`

**Description:** Type text into a input, text area or select an option from a &lt;select&gt; element.

Args:
  - uid (string): Element uid from page snapshot
  - value (string): Text to type or option to select
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'type', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to fill in
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

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

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

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

- **from_uid** (string) **(required)**: The uid of the element to drag
- **to_uid** (string) **(required)**: The uid of the element to drop into
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

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

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

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

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **amount** (number) _(optional)_: Scroll distance in pixels. Default is 300.
- **direction** (enum: "up", "down", "left", "right") _(optional)_: Direction to scroll within the element. If omitted, the element is scrolled into view without additional scrolling.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

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

- **durationMs** (integer) **(required)**: Duration to [`wait`](#wait) in milliseconds. Must be between 0 and 30000 (30 seconds).
- **reason** (string) _(optional)_: Optional reason for waiting (e.g., "waiting for animation to complete"). Included in the response for context.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

## Debugging

### `invoke_vscode_api`

**Description:** Execute VS Code API code to query editor state, workspace info, extensions, and more.

The code runs inside an async function body with `vscode` and `payload` in scope.
Use `return` to return a value. `await` is available. `require()` is NOT available.

Args:
  - expression (string): VS Code API code to execute. Must use `return` to return a value
  - payload (any): Optional JSON-serializable data passed as `payload` parameter
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, result: &lt;evaluated value&gt;, type: typeof result }
  Markdown format: Formatted result in JSON code block

Examples:
  - Get VS Code version:
    { expression: "return vscode.version;" }
  
  - List workspace folders:
    { expression: "return vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath);" }
  
  - Get active editor info:
    { expression: "const e = vscode.window.activeTextEditor; return e ? { file: e.document.fileName, line: e.selection.active.line, text: e.document.getText() } : null;" }
  
  - List open tabs:
    { expression: "return vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => ({ label: t.label, active: t.isActive })));" }
  
  - List active extensions:
    { expression: "return vscode.extensions.all.filter(e => e.isActive).map(e => e.id);" }
  
  - Get diagnostics (linting errors):
    { expression: "return vscode.languages.getDiagnostics().map(([uri, diags]) => ({ file: uri.fsPath, errors: diags.map(d => ({ line: d.range.start.line, message: d.message })) }));" }
  
  - Read workspace setting:
    { expression: "return vscode.workspace.getConfiguration('editor').get('fontSize');" }

Error Handling:
  - Throws if Extension Development Host bridge is not connected
  - Throws if expression execution fails
  - Returns error if response exceeds 25000 chars

**Parameters:**

- **expression** (string) **(required)**: VS Code API code to execute. Must use `return` to return a value. Runs inside an async function body, so `await` is available. `vscode` and `payload` are in scope. `require()` is NOT available.
- **payload** (unknown) _(optional)_: Optional JSON-serializable data passed as the `payload` parameter.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `invoke_vscode_command`

**Description:** Execute a VS Code command by ID.

Args:
  - command (string): The command ID to execute (e.g., "workbench.action.files.save", "editor.action.formatDocument")
  - args (array): Optional arguments to pass to the command
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, command: string, result: &lt;command return value&gt; }
  Markdown format: Command result in JSON code block

Examples:
  - Save current file: { command: "workbench.action.files.save" }
  - Format document: { command: "editor.action.formatDocument" }
  - Open file: { command: "vscode.open", args: [{ "$uri": "file:///path/to/file.ts" }] }
  - Go to line: { command: "workbench.action.gotoLine" }
  - Toggle sidebar: { command: "workbench.action.toggleSidebarVisibility" }
  - Open settings: { command: "workbench.action.openSettings" }
  - Run task: { command: "workbench.action.tasks.runTask", args: ["build"] }

Common command categories:
  - workbench.action.* — UI actions (save, open, toggle panels)
  - editor.action.* — Editor actions (format, fold, comment)
  - vscode.* — Core commands (open, diff, executeCommand)

Error Handling:
  - Throws if Extension Development Host bridge is not connected
  - Throws if command execution fails
  - Returns error if response exceeds 25000 chars

**Parameters:**

- **command** (string) **(required)**: The VS Code command ID to execute (e.g., "workbench.action.files.save", "editor.action.formatDocument")
- **args** (array) _(optional)_: Optional array of arguments to pass to the command. For URI arguments, use { "$uri": "file:///path" }.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

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

- **afterId** (integer) _(optional)_: Only return messages with ID greater than this (for incremental reads).
- **beforeId** (integer) _(optional)_: Only return messages with ID less than this.
- **fields** (array) _(optional)_: Which fields to include per message. Default: [id, type, text]. Options: id, type, text, timestamp, stackTrace, args
- **limit** (integer) _(optional)_: Get the N most recent messages. Omit to get all messages.
- **msgid** (number) _(optional)_: Get a specific message by ID with full details.
- **pattern** (string) _(optional)_: Regex pattern to match against message text (case-insensitive).
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **sourcePattern** (string) _(optional)_: Regex pattern to match against source URLs in stack traces.
- **stackDepth** (integer) _(optional)_: Max stack frames to include. Default: 1. Set 0 to exclude stack traces entirely.
- **textLimit** (integer) _(optional)_: Max characters per message text. Longer messages are truncated with "...".
- **types** (array) _(optional)_: Filter by log types: error, warning, info, debug, log, trace, etc.

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

- **afterLine** (integer) _(optional)_: Only return lines with line number greater than this (for incremental reads).
- **beforeLine** (integer) _(optional)_: Only return lines with line number less than this.
- **channel** (string) _(optional)_: Name of the output channel to read (e.g., "exthost", "main", "Git"). If omitted, lists all available channels.
- **limit** (integer) _(optional)_: Get the N most recent lines. Omit to get all lines.
- **lineLimit** (integer) _(optional)_: Max characters per line. Longer lines are truncated with "...".
- **pattern** (string) _(optional)_: Regex pattern to match against line content (case-insensitive).
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

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

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

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

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **verbose** (boolean) _(optional)_: Whether to include all possible information available in the full a11y tree. Default is false.

---
