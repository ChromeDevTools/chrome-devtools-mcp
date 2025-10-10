<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (7 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`upload_file`](#upload_file)
- **[Navigation automation](#navigation-automation)** (7 tools)
  - [`close_page`](#close_page)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`navigate_page_history`](#navigate_page_history)
  - [`new_page`](#new_page)
  - [`select_page`](#select_page)
  - [`wait_for`](#wait_for)
- **[Emulation](#emulation)** (3 tools)
  - [`emulate_cpu`](#emulate_cpu)
  - [`emulate_network`](#emulate_network)
  - [`resize_page`](#resize_page)
- **[Performance](#performance)** (3 tools)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (4 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

## Input automation

### `click`

**Description:** Clicks on the provided element

**Parameters:**

- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.
- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `drag`

**Description:** [`Drag`](#drag) an element onto another element

**Parameters:**

- **from_uid** (string) **(required)**: The uid of the element to [`drag`](#drag)
- **to_uid** (string) **(required)**: The uid of the element to drop into

---

### `fill`

**Description:** Type text into a input, text area or select an option from a &lt;select&gt; element.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to [`fill`](#fill) in

---

### `fill_form`

**Description:** [`Fill`](#fill) out multiple form elements at once

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill) out.

---

### `handle_dialog`

**Description:** If a browser dialog was opened, use this command to handle it

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Whether to dismiss or accept the dialog
- **promptText** (string) _(optional)_: Optional prompt text to enter into the dialog.

---

### `hover`

**Description:** [`Hover`](#hover) over the provided element

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `upload_file`

**Description:** Upload a file through a provided element.

**Parameters:**

- **filePath** (string) **(required)**: The local path of the file to upload
- **uid** (string) **(required)**: The uid of the file input element or an element that will open file chooser on the page from the page content snapshot

---

## Navigation automation

### `close_page`

**Description:** Closes the page by its index. The last open page cannot be closed.

**Parameters:**

- **pageIdx** (number) **(required)**: The index of the page to close. Call [`list_pages`](#list_pages) to list pages.

---

### `list_pages`

**Description:** Get a list of pages open in the browser.

**Parameters:** None

---

### `navigate_page`

**Description:** Navigates the currently selected page to a URL.

**Parameters:**

- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **url** (string) **(required)**: URL to navigate the page to

---

### `navigate_page_history`

**Description:** Navigates the currently selected page.

**Parameters:**

- **navigate** (enum: "back", "forward") **(required)**: Whether to navigate back or navigate forward in the selected pages history
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

### `new_page`

**Description:** Creates a new page

**Parameters:**

- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **url** (string) **(required)**: URL to load in a new page.

---

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- **pageIdx** (number) **(required)**: The index of the page to select. Call [`list_pages`](#list_pages) to list pages.

---

### `wait_for`

**Description:** Wait for the specified text to appear on the selected page.

**Parameters:**

- **text** (string) **(required)**: Text to appear on the page
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

## Emulation

### `emulate_cpu`

**Description:** Emulates CPU throttling by slowing down the selected page's execution.

**Parameters:**

- **throttlingRate** (number) **(required)**: The CPU throttling rate representing the slowdown factor 1-20x. Set the rate to 1 to disable throttling

---

### `emulate_network`

**Description:** Emulates network conditions such as throttling or offline mode on the selected page.

**Parameters:**

- **throttlingOption** (enum: "No emulation", "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") **(required)**: The network throttling option to emulate. Available throttling options are: No emulation, Offline, Slow 3G, Fast 3G, Slow 4G, Fast 4G. Set to "No emulation" to disable. Set to "Offline" to simulate offline network conditions.

---

### `resize_page`

**Description:** Resizes the selected page's window so that the page has specified dimension

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `performance_analyze_insight`

**Description:** Provides more detailed information on a specific Performance Insight that was highlighted in the results of a trace recording.

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"

---

### `performance_start_trace`

**Description:** Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.

**Parameters:**

- **autoStop** (boolean) **(required)**: Determines if the trace recording should be automatically stopped.
- **reload** (boolean) **(required)**: Determines if, once tracing has started, the page should be automatically reloaded.

---

### `performance_stop_trace`

**Description:** Stops the active performance trace recording on the selected page.

**Parameters:** None

---

## Network

### `get_network_request`

**Description:** Gets a network request by URL. You can get all requests by calling [`list_network_requests`](#list_network_requests).

**Parameters:**

- **url** (string) **(required)**: The URL of the request.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page since the last navigation.

**Parameters:**

- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.

---

## Debugging

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON
so returned values have to JSON-serializable.

**Parameters:**

- **args** (array) _(optional)_: An optional list of arguments to pass to the function.
- **function** (string) **(required)**: A JavaScript function to run in the currently selected page.
  Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
  Example with arguments: `(el) => {
  return el.innerText;
}`

---

### `list_console_messages`

**Description:** List all console messages for the currently selected page since the last navigation.

**Parameters:** None

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot.

**Parameters:** None

---
