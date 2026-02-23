<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference (~6182 cl100k_base tokens)

- **[Input automation](#input-automation)** (8 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`press_key`](#press_key)
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
- **[Debugging](#debugging)** (5 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`get_console_message`](#get_console_message)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

## Input automation

### `click`

**Description:** Clicks on an element.

**Parameters:**

- **uid** (string) **(required)**: uid of element from snapshot.
- **dblClick** (boolean) _(optional)_: true for double [`click`](#click). Default: false.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. Default: false.

---

### `drag`

**Description:** Drags an element onto another element.

**Parameters:**

- **from_uid** (string) **(required)**: uid of element to [`drag`](#drag).
- **to_uid** (string) **(required)**: uid of element to drop into.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. Default: false.

---

### `fill`

**Description:** Types text into an input, textarea or selects an option from a &lt;select&gt; element.

**Parameters:**

- **uid** (string) **(required)**: uid of element from snapshot.
- **value** (string) **(required)**: Value to [`fill`](#fill).
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. Default: false.

---

### `fill_form`

**Description:** Fills out multiple form elements at once.

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill).
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. Default: false.

---

### `handle_dialog`

**Description:** Handles an open browser dialog.

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Dialog action: accept or dismiss.
- **promptText** (string) _(optional)_: Optional prompt text for dialog.

---

### `hover`

**Description:** Hovers over an element.

**Parameters:**

- **uid** (string) **(required)**: uid of element from snapshot.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. Default: false.

---

### `press_key`

**Description:** Presses a key or key combination. Use this when other input methods like [`fill`](#fill)() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

**Parameters:**

- **key** (string) **(required)**: Key or combination (e.g., "Enter", "Control+A"). Modifiers: Control, Shift, Alt, Meta.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. Default: false.

---

### `upload_file`

**Description:** Uploads a file through a provided element.

**Parameters:**

- **filePath** (string) **(required)**: Local path of file to upload.
- **uid** (string) **(required)**: uid of file input or element that opens file chooser.
- **includeSnapshot** (boolean) _(optional)_: Include snapshot in response. Default: false.

---

## Navigation automation

### `close_page`

**Description:** Closes a page by its index. The last open page cannot be closed.

**Parameters:**

- **pageId** (number) **(required)**: ID of page to close. Use [`list_pages`](#list_pages).

---

### `list_pages`

**Description:** Get a list of open pages.

**Parameters:** None

---

### `navigate_page`

**Description:** Navigates to a URL.

**Parameters:**

- **handleBeforeUnload** (enum: "accept", "decline") _(optional)_: Auto-handle beforeunload dialogs. Default: accept.
- **ignoreCache** (boolean) _(optional)_: Ignore cache on reload.
- **initScript** (string) _(optional)_: JS script to run on new documents for next navigation.
- **timeout** (integer) _(optional)_: Max wait time in ms. 0 for default.
- **type** (enum: "url", "back", "forward", "reload") _(optional)_: Navigation type: url, back, forward, or reload.
- **url** (string) _(optional)_: Target URL (for type=url).

---

### `new_page`

**Description:** Creates a new page.

**Parameters:**

- **url** (string) **(required)**: URL for new page.
- **background** (boolean) _(optional)_: Open in background. Default: false.
- **isolatedContext** (string) _(optional)_: Name for isolated browser context. Pages in same context share cookies/storage.
- **timeout** (integer) _(optional)_: Max wait time in ms. 0 for default.

---

### `select_page`

**Description:** Select a page as a context for future calls.

**Parameters:**

- **pageId** (number) **(required)**: ID of page to select. Use [`list_pages`](#list_pages) to list pages.
- **bringToFront** (boolean) _(optional)_: Focus the page and bring it to top.

---

### `wait_for`

**Description:** Waits for a text to appear.

**Parameters:**

- **text** (string) **(required)**: Text to find on the page.
- **timeout** (integer) _(optional)_: Max wait time in ms. 0 for default.

---

## Emulation

### `emulate`

**Description:** Emulates various features.

**Parameters:**

- **colorScheme** (enum: "dark", "light", "auto") _(optional)_: [`Emulate`](#emulate) dark or light mode. "auto" to reset.
- **cpuThrottlingRate** (number) _(optional)_: CPU slowdown factor. 1 to disable. Omit to keep unchanged.
- **geolocation** (unknown) _(optional)_: Geolocation to [`emulate`](#emulate). null to clear override.
- **networkConditions** (enum: "No emulation", "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: Throttle network. "No emulation" to disable. Omit to keep unchanged.
- **userAgent** (unknown) _(optional)_: User agent to [`emulate`](#emulate). null to clear override.
- **viewport** (unknown) _(optional)_: Viewport to [`emulate`](#emulate). null to reset.

---

### `resize_page`

**Description:** Resizes the page's window to a specified dimension.

**Parameters:**

- **height** (number) **(required)**: Page height.
- **width** (number) **(required)**: Page width.

---

## Performance

### `performance_analyze_insight`

**Description:** Provides more details on a specific Performance Insight.

**Parameters:**

- **insightName** (string) **(required)**: Name of the insight, e.g., "DocumentLatency" or "LCPBreakdown".
- **insightSetId** (string) **(required)**: ID of the insight set from the "Available insight sets" list.

---

### `performance_start_trace`

**Description:** Starts a performance trace recording to find performance problems and insights.

**Parameters:**

- **autoStop** (boolean) **(required)**: Auto-stop trace recording.
- **reload** (boolean) **(required)**: Auto-reload page on trace start. Use [`navigate_page`](#navigate_page) first if needed.
- **filePath** (string) _(optional)_: Path to save raw trace data, e.g., trace.json or trace.json.gz.

---

### `performance_stop_trace`

**Description:** Stops the active performance trace recording.

**Parameters:**

- **filePath** (string) _(optional)_: Path to save raw trace data, e.g., trace.json or trace.json.gz.

---

### `take_memory_snapshot`

**Description:** Capture a memory heapsnapshot for memory leak debugging.

**Parameters:**

- **filePath** (string) **(required)**: Path to a .heapsnapshot file.

---

## Network

### `get_network_request`

**Description:** Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

**Parameters:**

- **reqid** (number) _(optional)_: reqid of network request. Omit for selected in DevTools.
- **requestFilePath** (string) _(optional)_: Path to save request body. Omit for inline.
- **responseFilePath** (string) _(optional)_: Path to save response body. Omit for inline.

---

### `list_network_requests`

**Description:** List all requests since the last navigation.

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Set to true for preserved requests over last 3 navigations.
- **pageIdx** (integer) _(optional)_: 0-based page number. Omit for first page.
- **pageSize** (integer) _(optional)_: Max requests to return. Omit for all.
- **resourceTypes** (array) _(optional)_: Filter by resource type. Omit or empty for all.

---

## Debugging

### `evaluate_script`

**Description:** Evaluate a JavaScript function. Returns the response as JSON, so returned values have to be JSON-serializable.

**Parameters:**

- **function** (string) **(required)**: JS function to run on the page. Ex: `() => document.title`, or with args: `(el) => el.innerText`.
- **args** (array) _(optional)_: Optional arguments for the function.

---

### `get_console_message`

**Description:** Gets a console message by its ID. You can get all messages by calling [`list_console_messages`](#list_console_messages).

**Parameters:**

- **msgid** (number) **(required)**: msgid of a console message from listed messages

---

### `list_console_messages`

**Description:** List all console messages since the last navigation.

**Parameters:**

- **includePreservedMessages** (boolean) _(optional)_: Set to true for preserved messages over last 3 navigations.
- **pageIdx** (integer) _(optional)_: 0-based page number. Omit for first page.
- **pageSize** (integer) _(optional)_: Max messages to return. Omit for all.
- **types** (array) _(optional)_: Filter by message type. Omit or empty for all.

---

### `take_screenshot`

**Description:** Takes a screenshot of the page or an element.

**Parameters:**

- **filePath** (string) _(optional)_: Path to save screenshot. If omitted, attaches to response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Screenshot format. Default: "png".
- **fullPage** (boolean) _(optional)_: true for full page screenshot. Incompatible with uid.
- **quality** (number) _(optional)_: JPEG/WebP quality (0-100). Higher is better. Ignored for PNG.
- **uid** (string) _(optional)_: uid of element from snapshot. Omit for page screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot based on the a11y tree.

**Parameters:**

- **filePath** (string) _(optional)_: Path to save snapshot. If omitted, attaches to response.
- **verbose** (boolean) _(optional)_: Include all info from the a11y tree. Default: false.

---
