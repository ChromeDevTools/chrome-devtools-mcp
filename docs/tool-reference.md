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
- **[Debugging](#debugging)** (5 tools)
  - [`evaluate_script`](#evaluate_script)
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

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON,
so returned values have to be JSON-serializable.

Args:
  - function (string): JavaScript function to execute in page context
  - args (array): Optional element UIDs to pass as arguments
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, result: &lt;serialized return value&gt; }
  Markdown format: "Script ran on page and returned:" + JSON code block

Examples:
  - "Get page title" -> { function: "() => document.title" }
  - "Get element text" -> { function: "(el) => el.innerText", args: [{ uid: "abc123" }] }
  - "Async fetch" -> { function: "async () => await fetch('/api').then(r => r.json())" }

Error Handling:
  - Throws with "Script error: ..." if execution fails
  - Returns error if response exceeds 25000 chars

**Parameters:**

- **function** (string) **(required)**: A JavaScript function declaration to be executed by the tool in the currently selected page.
Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
Example with arguments: `(el) => {
  return el.innerText;
}`

- **args** (array) _(optional)_: An optional list of arguments to pass to the function.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `read_console`

**Description:** Read console messages from the currently selected page. Can either list all messages with filtering, or get a specific message by ID with full details.

**Mode 1: List messages** (when msgid is NOT provided)
Lists console messages since the last navigation with optional filtering and pagination.

Args:
  - pageSize (number): Maximum messages to return. Default: all
  - pageIdx (number): Page number (0-based) for pagination. Default: 0
  - types (string[]): Filter by message types (log, error, warning, info, debug, etc.)
  - textFilter (string): Case-insensitive substring to match in message text
  - sourceFilter (string): Substring to match in stack trace source URLs
  - isRegex (boolean): Treat textFilter as regex pattern. Default: false
  - secondsAgo (number): Only messages from last N seconds
  - filterLogic ('and'|'or'): How to combine filters. Default: 'and'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, count, offset, has_more, next_offset?, messages: [{id, type, text, timestamp, stackTrace?}] }
  Markdown format: Formatted list with msgid, type tag, text, and first stack frame

**Mode 2: Get single message** (when msgid IS provided)
Gets detailed information about a specific console message including arguments.

Args:
  - msgid (number): The message ID to retrieve
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { id, type, text, timestamp, args?, stackTrace? }
  Markdown format: Formatted message details with arguments and stack trace

Examples:
  - "Show only errors" -> { types: ['error'] }
  - "Find fetch failures" -> { textFilter: 'net::ERR', types: ['error'] }
  - "Recent warnings" -> { types: ['warning'], secondsAgo: 60 }
  - "Get message 5" -> { msgid: 5 }
  - "Get message as JSON" -> { msgid: 5, response_format: 'json' }

Error Handling:
  - Returns "No console messages found." if no messages match filters
  - Returns "Console message with id X not found." if msgid doesn't exist
  - Returns error with available params if response exceeds 25000 chars

**Parameters:**

- **filterLogic** (enum: "and", "or") _(optional)_: How to combine multiple filters. "and" = all filters must match (default). "or" = any filter can match. Only used when listing messages (msgid not provided).
- **includePreservedMessages** (boolean) _(optional)_: Set to true to return the preserved messages over the last 3 navigations. Only used when listing messages (msgid not provided).
- **isRegex** (boolean) _(optional)_: If true, treat textFilter as a regular expression pattern. Default is false (substring match). Only used when listing messages (msgid not provided).
- **msgid** (number) _(optional)_: The ID of a specific console message to retrieve with full details. When provided, returns only that message with arguments and stack trace. When omitted, lists all messages.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page. Only used when listing messages (msgid not provided).
- **pageSize** (integer) _(optional)_: Maximum number of messages to return. When omitted, returns all messages. Only used when listing messages (msgid not provided).
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **secondsAgo** (integer) _(optional)_: Only return messages from the last N seconds. Useful for filtering recent activity. Only used when listing messages (msgid not provided).
- **sourceFilter** (string) _(optional)_: Substring to match against the source URL in the stack trace. Only messages originating from a matching source are returned. Only used when listing messages (msgid not provided).
- **textFilter** (string) _(optional)_: Case-insensitive substring to match against the message text. Only messages whose text contains this string are returned. Only used when listing messages (msgid not provided).
- **types** (array) _(optional)_: Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages. Only used when listing messages (msgid not provided).

---

### `read_output`

**Description:** Read VS Code output logs from the workspace session. When called without a channel, lists all available output channels. When called with a channel name, returns the complete log content.

Args:
  - channel (string): Optional. Output channel name to read (e.g., "exthost", "main", "Git"). If omitted, lists all available channels.
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  When channel is omitted (list mode):
    JSON format: { mode: 'list', total, channels: [{name, category, sizeKb}] }
    Markdown format: Organized list by category (Main Logs, Extension Host, Output Channels, etc.)
  
  When channel is provided (content mode):
    JSON format: { mode: 'content', channel, total_lines, content }
    Markdown format: Full log content in a code block

Examples:
  - "List all channels" -> {}
  - "Read extension host logs" -> { channel: "exthost" }
  - "Read main VS Code logs" -> { channel: "main" }

Error Handling:
  - Returns "No logs directory found." if VS Code debug window isn't running
  - Returns "Channel X not found." with available channels if channel doesn't exist

**Parameters:**

- **channel** (string) _(optional)_: Name of the output channel to read (e.g., "exthost", "main", "Git"). If omitted, lists all available channels.
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
