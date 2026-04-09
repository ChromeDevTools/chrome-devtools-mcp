<!-- AUTO GENERATED DO NOT EDIT - run 'npm run gen' to update-->

# Chrome DevTools MCP Tool Reference (~6199 cl100k_base tokens)

- **[Input automation](#input-automation)** (9 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`press_key`](#press_key)
  - [`type_text`](#type_text)
  - [`upload_file`](#upload_file)
- **[Navigation automation](#navigation-automation)** (6 tools)
  - [`close_page`](#close_page)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`new_page`](#new_page)
  - [`select_page`](#select_page)
  - [`wait_for`](#wait_for)
- **[Emulation](#emulation)** (2 tools)
  - [`emulate`](#emulate)
  - [`resize_page`](#resize_page)
- **[Performance](#performance)** (4 tools)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
  - [`take_memory_snapshot`](#take_memory_snapshot)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (6 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`get_console_message`](#get_console_message)
  - [`lighthouse_audit`](#lighthouse_audit)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

## Input automation

### `click`

**Description:** Clicks on the provided element

**Parameters:**

- **uid** (string) **(required)**: Element UID from snapshot.
- **dblClick** (boolean) _(optional)_: Set to true for double clicks. If omitted: false
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. If omitted: false

---

### `drag`

**Description:** [`Drag`](#drag) an element onto another element

**Parameters:**

- **from_uid** (string) **(required)**: UID of element to [`drag`](#drag).
- **to_uid** (string) **(required)**: UID of element to drop into.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. If omitted: false

---

### `fill`

**Description:** Type text into input, textarea, or select option.

**Parameters:**

- **uid** (string) **(required)**: Element UID from snapshot.
- **value** (string) **(required)**: Value to [`fill`](#fill).
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. If omitted: false

---

### `fill_form`

**Description:** [`Fill`](#fill) multiple form elements.

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill) out.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. If omitted: false

---

### `handle_dialog`

**Description:** Handle open browser dialog.

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Dismiss or accept dialog.
- **promptText** (string) _(optional)_: Prompt text to enter.

---

### `hover`

**Description:** [`Hover`](#hover) over the provided element

**Parameters:**

- **uid** (string) **(required)**: Element UID from snapshot.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. If omitted: false

---

### `press_key`

**Description:** Press a key or combination. Use for shortcuts or when [`fill`](#fill)() fails.

**Parameters:**

- **key** (string) **(required)**: Key or combination (e.g., "Enter", "Control+A"). Modifiers: Control, Shift, Alt, Meta.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. If omitted: false

---

### `type_text`

**Description:** Type text into focused input.

**Parameters:**

- **text** (string) **(required)**: Text to type.
- **submitKey** (string) _(optional)_: Optional key to press after typing. E.g., "Enter", "Tab", "Escape"

---

### `upload_file`

**Description:** Upload file through element.

**Parameters:**

- **filePath** (string) **(required)**: Local path of file to upload.
- **uid** (string) **(required)**: UID of file input or element opening file chooser.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. If omitted: false

---

## Navigation automation

### `close_page`

**Description:** Close page by ID. Cannot close last page.

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to close. Call [`list_pages`](#list_pages) to list pages.

---

### `list_pages`

**Description:** List open pages.

**Parameters:** None

---

### `navigate_page`

**Description:** Go to URL, back, forward, or reload.

**Parameters:**

- **handleBeforeUnload** (enum: "accept", "decline") _(optional)_: Auto accept beforeunload dialogs. If omitted: accept
- **ignoreCache** (boolean) _(optional)_: Ignore cache on reload.
- **initScript** (string) _(optional)_: JS script to execute on new documents.
- **timeout** (integer) _(optional)_: Max wait time in ms. 0 for default.
- **type** (enum: "url", "back", "forward", "reload") _(optional)_: Navigation type.
- **url** (string) _(optional)_: Target URL.

---

### `new_page`

**Description:** Open new tab and load URL.

**Parameters:**

- **url** (string) **(required)**: URL to load.
- **background** (boolean) _(optional)_: Open page in background. If omitted: false (foreground)
- **isolatedContext** (string) _(optional)_: Isolated browser context name. Shared cookies/storage within context.
- **timeout** (integer) _(optional)_: Max wait time in ms. 0 for default.

---

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to select. Call [`list_pages`](#list_pages) to get available pages.
- **bringToFront** (boolean) _(optional)_: Focus page and bring to top.

---

### `wait_for`

**Description:** Wait for the specified text to appear on the page.

**Parameters:**

- **text** (array) **(required)**: Non-empty list of texts. Resolves when any value appears on the page.
- **timeout** (integer) _(optional)_: Max wait time in ms. 0 for default.

---

## Emulation

### `emulate`

**Description:** [`Emulate`](#emulate) features on page.

**Parameters:**

- **colorScheme** (enum: "dark", "light", "auto") _(optional)_: [`Emulate`](#emulate) dark or light mode. "auto" to reset.
- **cpuThrottlingRate** (number) _(optional)_: CPU slowdown factor. 1 to disable.
- **geolocation** (string) _(optional)_: Geolocation (&lt;lat&gt;x&lt;lon&gt;). Lat: -90 to 90. Lon: -180 to 180.
- **networkConditions** (enum: "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: Throttle network. Omit to disable.
- **userAgent** (string) _(optional)_: User agent to [`emulate`](#emulate). Empty string to clear.
- **viewport** (string) _(optional)_: Viewport spec: '&lt;w&gt;x&lt;h&gt;x&lt;dpr&gt;[,mobile][,touch][,landscape]'.

---

### `resize_page`

**Description:** Resize page window.

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `performance_analyze_insight`

**Description:** Get details on a specific Performance Insight.

**Parameters:**

- **insightName** (string) **(required)**: Insight name (e.g., "DocumentLatency").
- **insightSetId** (string) **(required)**: ID for specific insight set. Use IDs from results.

---

### `performance_start_trace`

**Description:** Start performance trace. Use to find issues and improve speed.

**Parameters:**

- **autoStop** (boolean) _(optional)_: Auto stop trace recording.
- **filePath** (string) _(optional)_: Path to save raw trace data. E.g., trace.json.gz.
- **reload** (boolean) _(optional)_: Reload page. Use [`navigate_page`](#navigate_page) BEFORE starting if true.

---

### `performance_stop_trace`

**Description:** Stop active performance trace.

**Parameters:**

- **filePath** (string) _(optional)_: Path to save raw trace data. E.g., trace.json.gz.

---

### `take_memory_snapshot`

**Description:** Capture a heap snapshot to analyze JS memory distribution and debug leaks.

**Parameters:**

- **filePath** (string) **(required)**: A path to a .heapsnapshot file to save the heapsnapshot to.

---

## Network

### `get_network_request`

**Description:** Gets a network request by an optional reqid. If omitted: selected request

**Parameters:**

- **reqid** (number) _(optional)_: The reqid of the network request. If omitted: selected request
- **requestFilePath** (string) _(optional)_: The absolute or relative path to save the request body to. If omitted: inline
- **responseFilePath** (string) _(optional)_: The absolute or relative path to save the response body to. If omitted: inline

---

### `list_network_requests`

**Description:** List network requests since last navigation.

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Return preserved requests over last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number (0-based). If omitted: 0.
- **pageSize** (integer) _(optional)_: Max requests to return. If omitted: all.
- **resourceTypes** (array) _(optional)_: Filter by resource types. If omitted: all.

---

## Debugging

### `evaluate_script`

**Description:** Evaluate JS function in page. Returns JSON-serializable response.

**Parameters:**

- **function** (string) **(required)**: JS function to execute. Examples: `() => document.title`, `(el) => el.innerText`.
- **args** (array) _(optional)_: Arguments to pass to the function.

---

### `get_console_message`

**Description:** Gets a console message by its ID. You can get all messages by calling [`list_console_messages`](#list_console_messages).

**Parameters:**

- **msgid** (number) **(required)**: The msgid of a console message on the page from the listed console messages

---

### `lighthouse_audit`

**Description:** Get Lighthouse score for a11y, SEO, and best practices. Excludes performance (use [`performance_start_trace`](#performance_start_trace)).

**Parameters:**

- **device** (enum: "desktop", "mobile") _(optional)_: Device to [`emulate`](#emulate).
- **mode** (enum: "navigation", "snapshot") _(optional)_: "navigation" reloads &amp; audits. "snapshot" analyzes current state.
- **outputDirPath** (string) _(optional)_: Directory for reports. Default temporary files.

---

### `list_console_messages`

**Description:** List console messages since last navigation.

**Parameters:**

- **includePreservedMessages** (boolean) _(optional)_: Return preserved messages over last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number (0-based). If omitted: 0.
- **pageSize** (integer) _(optional)_: Max messages to return. If omitted: all.
- **types** (array) _(optional)_: Filter by message types. If omitted: all.

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. If omitted: "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for (0-100). Higher values mean better quality but larger sizes. Ignored for PNG format.
- **uid** (string) _(optional)_: Element UID from snapshot. If omitted: page screenshot

---

### `take_snapshot`

**Description:** Take a text snapshot using the a11y tree. Lists elements with a unique ID (uid). Prefer snapshots over screenshots. Indicates the element selected in the DevTools Elements panel.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **verbose** (boolean) _(optional)_: Include all info in the a11y tree. If omitted: false

---
