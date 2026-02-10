<!-- AUTO GENERATED DO NOT EDIT - run 'pnpm run docs' to update-->

# VS Code DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (7 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`hotkey`](#hotkey)
  - [`hover`](#hover)
  - [`scroll`](#scroll)
  - [`type`](#type)
  - [`wait`](#wait)
- **[Performance](#performance)** (3 tools)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (7 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`get_console_message`](#get_console_message)
  - [`get_output_panel_content`](#get_output_panel_content)
  - [`list_console_messages`](#list_console_messages)
  - [`list_output_channels`](#list_output_channels)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

## Input automation

### `click`

**Description:** Clicks on the provided element.

Args:
  - uid (string): Element uid from page snapshot
  - dblClick (boolean): Double [`click`](#click). Default: false
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: '[`click`](#click)', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

Examples:
  - "[`Click`](#click) button" -> { uid: "abc123" }
  - "Double [`click`](#click)" -> { uid: "abc123", dblClick: true }

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `drag`

**Description:** [`Drag`](#drag) an element onto another element.

Args:
  - from_uid (string): Element uid to [`drag`](#drag)
  - to_uid (string): Element uid to drop onto
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: '[`drag`](#drag)', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

**Parameters:**

- **from_uid** (string) **(required)**: The uid of the element to [`drag`](#drag)
- **to_uid** (string) **(required)**: The uid of the element to drop into
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `hotkey`

**Description:** Press a key or key combination. Use this when other input methods like [`type`](#type)() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

Args:
  - key (string): Key or combination (e.g., "Enter", "Control+A", "Control+Shift+R")
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: '[`hotkey`](#hotkey)', key: string, success: true, changes?: string }
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

### `hover`

**Description:** [`Hover`](#hover) over the provided element.

Args:
  - uid (string): Element uid from page snapshot
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: '[`hover`](#hover)', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `scroll`

**Description:** [`Scroll`](#scroll) an element into view, or [`scroll`](#scroll) within a scrollable element in a given direction. If no direction is provided, the element is simply scrolled into the viewport.

Args:
  - uid (string): Element uid from page snapshot
  - direction ('up'|'down'|'left'|'right'): [`Scroll`](#scroll) direction. Optional
  - amount (number): [`Scroll`](#scroll) distance in pixels. Default: 300
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: '[`scroll`](#scroll)', direction?, amount?, success: true, changes?: string }
  Markdown format: Changes detected + [`scroll`](#scroll) confirmation

Examples:
  - "[`Scroll`](#scroll) element into view" -> { uid: "abc123" }
  - "[`Scroll`](#scroll) down 500px" -> { uid: "abc123", direction: "down", amount: 500 }

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **amount** (number) _(optional)_: [`Scroll`](#scroll) distance in pixels. Default is 300.
- **direction** (enum: "up", "down", "left", "right") _(optional)_: Direction to [`scroll`](#scroll) within the element. If omitted, the element is scrolled into view without additional scrolling.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `type`

**Description:** [`Type`](#type) text into a input, text area or select an option from a &lt;select&gt; element.

Args:
  - uid (string): Element uid from page snapshot
  - value (string): Text to [`type`](#type) or option to select
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: '[`type`](#type)', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to fill in
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

## Performance

### `performance_analyze_insight`

**Description:** Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.

Args:
  - insightSetId (string): Insight set ID from "Available insight sets" list
  - insightName (string): Insight name (e.g., "DocumentLatency", "LCPBreakdown")
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  Detailed insight analysis with recommendations

Examples:
  - "Analyze LCP breakdown" -> { insightSetId: "main-frame", insightName: "LCPBreakdown" }
  - "Check document latency" -> { insightSetId: "main-frame", insightName: "DocumentLatency" }

Error Handling:
  - Returns "No recorded traces found." if no trace has been recorded

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"
- **insightSetId** (string) **(required)**: The id for the specific insight set. Only use the ids given in the "Available insight sets" list.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `performance_start_trace`

**Description:** Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.

Args:
  - reload (boolean): Reload page after starting trace. Navigate to desired URL BEFORE calling
  - autoStop (boolean): Auto-stop trace after 5 seconds
  - filePath (string): Save raw trace to file (e.g., trace.json.gz)
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { status: 'recording'|'completed', message, filePath? }
  Markdown format: Recording status or trace analysis summary

Examples:
  - "Record page load" -> { reload: true, autoStop: true }
  - "Start manual recording" -> { reload: false, autoStop: false }
  - "Save trace" -> { reload: true, autoStop: true, filePath: "trace.json.gz" }

Error Handling:
  - Returns error if trace is already running
  - Only one trace can run at a time

**Parameters:**

- **autoStop** (boolean) **(required)**: Determines if the trace recording should be automatically stopped.
- **reload** (boolean) **(required)**: Determines if, once tracing has started, the current selected page should be automatically reloaded. Ensure the page is at the correct URL BEFORE starting the trace if reload or autoStop is set to true.
- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `performance_stop_trace`

**Description:** Stops the active performance trace recording on the selected page.

Args:
  - filePath (string): Save raw trace to file (e.g., trace.json.gz)
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { status: 'stopped'|'not_running', message, filePath? }
  Markdown format: Trace stopped confirmation + analysis summary

Examples:
  - "Stop and analyze" -> {}
  - "Stop and save" -> { filePath: "trace.json.gz" }

Error Handling:
  - Returns "No performance trace is currently running." if no trace active

**Parameters:**

- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

## Network

### `get_network_request`

**Description:** Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

Args:
  - reqid (number): Request ID from [`list_network_requests`](#list_network_requests) output
  - requestFilePath (string): Save request body to file path
  - responseFilePath (string): Save response body to file path
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { id, url, method, resourceType, status?, headers?, requestBody?, responseBody? }
  Markdown format: Formatted request details with headers and bodies

Examples:
  - "Get request 5" -> { reqid: 5 }
  - "Save response to file" -> { reqid: 5, responseFilePath: "./response.json" }

Error Handling:
  - Returns "Please provide a reqid" if reqid is not provided
  - Returns "Network request with id X not found." if request doesn't exist

**Parameters:**

- **reqid** (number) _(optional)_: The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.
- **requestFilePath** (string) _(optional)_: The absolute or relative path to save the request body to. If omitted, the body is returned inline.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **responseFilePath** (string) _(optional)_: The absolute or relative path to save the response body to. If omitted, the body is returned inline.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page since the last navigation.

Args:
  - pageSize (number): Maximum requests to return. Default: all
  - pageIdx (number): Page number (0-based) for pagination. Default: 0
  - resourceTypes (string[]): Filter by resource types (document, xhr, fetch, script, etc.)
  - includePreservedRequests (boolean): Include requests from last 3 navigations. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, count, offset, has_more, next_offset?, requests: [{id, url, method, resourceType, status?, failed?}] }
  Markdown format: Formatted request list with reqid, method, URL, status

Examples:
  - "Show XHR and fetch requests" -> { resourceTypes: ['xhr', 'fetch'] }
  - "Get first 10 requests as JSON" -> { pageSize: 10, response_format: 'json' }

Error Handling:
  - Returns "No network requests found." if no requests match filters
  - Returns error if response exceeds 25000 chars

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Set to true to return the preserved requests over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.
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

### `get_console_message`

**Description:** Gets a console message by its ID. You can get all messages by calling [`list_console_messages`](#list_console_messages).

Args:
  - msgid (number): The message ID from [`list_console_messages`](#list_console_messages) output
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { id, [`type`](#type), text, timestamp, args?, stackTrace? }
  Markdown format: Formatted message details with arguments and stack trace

Examples:
  - "Get message 5" -> { msgid: 5 }
  - "Get message as JSON" -> { msgid: 5, response_format: 'json' }

Error Handling:
  - Returns "Console message with id X not found." if message doesn't exist

**Parameters:**

- **msgid** (number) **(required)**: The msgid of a console message on the page from the listed console messages
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.

---

### `get_output_panel_content`

**Description:** Get the text content from the currently visible VS Code Output panel. Optionally switch to a specific output channel first.

Args:
  - channel (string): Output channel name (e.g., "Git", "TypeScript", "Extension Host"). Default: exthost or main
  - maxLines (number): Maximum lines to return. Default: 200
  - tail (boolean): Return last N lines (true) or first N (false). Default: true
  - filter (string): Case-insensitive substring filter
  - isRegex (boolean): Treat filter as regex. Default: false
  - levels (string[]): Filter by log levels (error, warning, info, debug, trace)
  - secondsAgo (number): Only lines from last N seconds
  - filterLogic ('and'|'or'): How to combine filters. Default: 'and'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { channel, total_lines, returned_lines, has_more, filters?, lines: [...] }
  Markdown format: Formatted log output with filter summary

Examples:
  - "Show errors from Extension Host" -> { channel: "exthost", levels: ["error"] }
  - "Recent TypeScript logs" -> { channel: "TypeScript", secondsAgo: 300 }
  - "Search for specific error" -> { filter: "ENOENT", isRegex: false }
  - "Get as JSON" -> { channel: "main", response_format: 'json' }

Error Handling:
  - Returns "Channel X not found." with available channels if channel doesn't exist
  - Returns error if response exceeds 25000 chars

**Parameters:**

- **channel** (string) _(optional)_: Name of the output channel to read (e.g., "Git", "TypeScript", "Extension Host"). If omitted, reads the currently visible channel.
- **filter** (string) _(optional)_: Case-insensitive substring filter. Only lines containing this text are returned.
- **filterLogic** (enum: "and", "or") _(optional)_: How to combine multiple filters. "and" = all filters must match (default). "or" = any filter can match.
- **isRegex** (boolean) _(optional)_: If true, treat the filter as a regular expression pattern. Default is false (substring match).
- **levels** (array) _(optional)_: Filter by log level(s). Only lines with matching levels are returned. Levels: error, warning, info, debug, trace.
- **maxLines** (integer) _(optional)_: Maximum number of lines to return. Default is 200. Use a smaller value to reduce output size.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **secondsAgo** (integer) _(optional)_: Only return log lines from the last N seconds. Useful for filtering recent activity.
- **tail** (boolean) _(optional)_: If true, returns the last N lines (most recent). If false, returns the first N lines. Default is true.

---

### `list_console_messages`

**Description:** List all console messages for the currently selected page since the last navigation.

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
  JSON format: { total, count, offset, has_more, next_offset?, messages: [{id, [`type`](#type), text, timestamp, stackTrace?}] }
  Markdown format: Formatted list with msgid, [`type`](#type) tag, text, and first stack frame

Examples:
  - "Show only errors" -> { types: ['error'] }
  - "Find fetch failures" -> { textFilter: 'net::ERR', types: ['error'] }
  - "Recent warnings" -> { types: ['warning'], secondsAgo: 60 }
  - "Get JSON for processing" -> { response_format: 'json' }

Error Handling:
  - Returns "No console messages found." if no messages match filters
  - Returns error with available params if response exceeds 25000 chars

**Parameters:**

- **filterLogic** (enum: "and", "or") _(optional)_: How to combine multiple filters. "and" = all filters must match (default). "or" = any filter can match.
- **includePreservedMessages** (boolean) _(optional)_: Set to true to return the preserved messages over the last 3 navigations.
- **isRegex** (boolean) _(optional)_: If true, treat textFilter as a regular expression pattern. Default is false (substring match).
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of messages to return. When omitted, returns all messages.
- **response_format** (unknown) _(optional)_: Output format: "markdown" for human-readable or "json" for machine-readable structured data.
- **secondsAgo** (integer) _(optional)_: Only return messages from the last N seconds. Useful for filtering recent activity.
- **sourceFilter** (string) _(optional)_: Substring to match against the source URL in the stack trace. Only messages originating from a matching source are returned.
- **textFilter** (string) _(optional)_: Case-insensitive substring to match against the message text. Only messages whose text contains this string are returned.
- **types** (array) _(optional)_: Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.

---

### `list_output_channels`

**Description:** List all available output channels in the VS Code Output panel (e.g., "Git", "TypeScript", "ESLint", "Extension Host").

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, channels: [{name, category, sizeKb}] }
  Markdown format: Organized list by category (Main Logs, Extension Host, Output Channels, etc.)

Examples:
  - "List all channels" -> {}
  - "Get channels as JSON" -> { response_format: 'json' }

Error Handling:
  - Returns "No logs directory found." if VS Code debug window isn't running
  - Returns "No log files found." if logs directory is empty

**Parameters:**

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
  JSON format: { success: true, [`type`](#type), format, savedTo?, sizeBytes?, attached? }
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
- **format** (enum: "png", "jpeg", "webp") _(optional)_: [`Type`](#type) of format to save the screenshot as. Default is "png"
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
