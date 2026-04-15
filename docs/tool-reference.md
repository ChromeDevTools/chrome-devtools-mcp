<!-- AUTO GENERATED DO NOT EDIT - run 'npm run gen' to update-->

# Chrome DevTools MCP Tool Reference (~8805 cl100k_base tokens)

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
- **[Debugging](#debugging)** (14 tools)
  - [`diff_computed_styles`](#diff_computed_styles)
  - [`diff_computed_styles_snapshot`](#diff_computed_styles_snapshot)
  - [`evaluate_script`](#evaluate_script)
  - [`get_box_model`](#get_box_model)
  - [`get_computed_styles`](#get_computed_styles)
  - [`get_computed_styles_batch`](#get_computed_styles_batch)
  - [`get_console_message`](#get_console_message)
  - [`get_visibility`](#get_visibility)
  - [`highlight_elements_for_styles`](#highlight_elements_for_styles)
  - [`lighthouse_audit`](#lighthouse_audit)
  - [`list_console_messages`](#list_console_messages)
  - [`save_computed_styles_snapshot`](#save_computed_styles_snapshot)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

## Input automation

### `click`

**Description:** Perform a primary (or double) [`click`](#click) on an element identified by snapshot uid. Prefer this over guessing selectors when automating from [`take_snapshot`](#take_snapshot).

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `drag`

**Description:** [`Drag`](#drag) from_uid onto to_uid for drop targets, reorder lists, or file-like interactions modeled as [`drag`](#drag)-and-drop.

**Parameters:**

- **from_uid** (string) **(required)**: The uid of the element to [`drag`](#drag)
- **to_uid** (string) **(required)**: The uid of the element to drop into
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `fill`

**Description:** Set value on inputs, textareas, or select/combobox options from snapshot uid. Prefer over [`type_text`](#type_text) when filling whole fields.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to [`fill`](#fill) in
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `fill_form`

**Description:** Batch-[`fill`](#fill) many {uid, value} pairs in one call for multi-field forms.

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill) out.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `handle_dialog`

**Description:** Accept or dismiss the current alert/confirm/prompt; optional promptText for prompt().

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Whether to dismiss or accept the dialog
- **promptText** (string) _(optional)_: Optional prompt text to enter into the dialog.

---

### `hover`

**Description:** Move the pointer over a uid so [`hover`](#hover)-only UI (menus, tooltips) appears before another action.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `press_key`

**Description:** Press a key chord (e.g. Control+R, Escape). Use for shortcuts or when [`fill`](#fill)/[`type_text`](#type_text) cannot model the interaction.

**Parameters:**

- **key** (string) **(required)**: A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `type_text`

**Description:** Send keystrokes to the focused element; optional submitKey (e.g. Enter). Use after [`click`](#click)/[`fill`](#fill) when key-by-key input matters.

**Parameters:**

- **text** (string) **(required)**: The text to type
- **submitKey** (string) _(optional)_: Optional key to press after typing. E.g., "Enter", "Tab", "Escape"

---

### `upload_file`

**Description:** Attach a local file path to a file input or an element that opens a file chooser.

**Parameters:**

- **filePath** (string) **(required)**: The local path of the file to upload
- **uid** (string) **(required)**: The uid of the file input element or an element that will open file chooser on the page from the page content snapshot
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

## Navigation automation

### `close_page`

**Description:** Close a tab by pageId from [`list_pages`](#list_pages). The last tab cannot be closed.

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to close. Call [`list_pages`](#list_pages) to list pages.

---

### `list_pages`

**Description:** List browser tabs with ids and URLs for [`select_page`](#select_page) / [`close_page`](#close_page).

**Parameters:** None

---

### `navigate_page`

**Description:** Navigate: url, back, forward, or reload; optional cache bypass, per-navigation init script, beforeunload handling.

**Parameters:**

- **handleBeforeUnload** (enum: "accept", "decline") _(optional)_: Whether to auto accept or beforeunload dialogs triggered by this navigation. Default is accept.
- **ignoreCache** (boolean) _(optional)_: Whether to ignore cache on reload.
- **initScript** (string) _(optional)_: A JavaScript script to be executed on each new document before any other scripts for the next navigation.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **type** (enum: "url", "back", "forward", "reload") _(optional)_: Navigate the page by URL, back or forward in history, or reload.
- **url** (string) _(optional)_: Target URL (only type=url)

---

### `new_page`

**Description:** Open a tab and goto url; optional background or isolatedContext (separate storage). Use for parallel sessions.

**Parameters:**

- **url** (string) **(required)**: URL to load in a new page.
- **background** (boolean) _(optional)_: Whether to open the page in the background without bringing it to the front. Default is false (foreground).
- **isolatedContext** (string) _(optional)_: If specified, the page is created in an isolated browser context with the given name. Pages in the same browser context share cookies and storage. Pages in different browser contexts are fully isolated.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

### `select_page`

**Description:** Make pageId the active tab for following tools (required when multiple tabs are open).

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to select. Call [`list_pages`](#list_pages) to get available pages.
- **bringToFront** (boolean) _(optional)_: Whether to focus the page and bring it to the top.

---

### `wait_for`

**Description:** Wait until any of the given strings appears (async rendering, SPA transitions).

**Parameters:**

- **text** (array) **(required)**: Non-empty list of texts. Resolves when any value appears on the page.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

## Emulation

### `emulate`

**Description:** Apply one-shot emulation: throttling, CPU slowdown, geolocation, UA, color scheme, device viewport string.

**Parameters:**

- **colorScheme** (enum: "dark", "light", "auto") _(optional)_: [`Emulate`](#emulate) the dark or the light mode. Set to "auto" to reset to the default.
- **cpuThrottlingRate** (number) _(optional)_: Represents the CPU slowdown factor. Omit or set the rate to 1 to disable throttling
- **geolocation** (string) _(optional)_: Geolocation (`&lt;latitude&gt;x&lt;longitude&gt;`) to [`emulate`](#emulate). Latitude between -90 and 90. Longitude between -180 and 180. Omit to clear the geolocation override.
- **networkConditions** (enum: "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: Throttle network. Omit to disable throttling.
- **userAgent** (string) _(optional)_: User agent to [`emulate`](#emulate). Set to empty string to clear the user agent override.
- **viewport** (string) _(optional)_: [`Emulate`](#emulate) device viewports '&lt;width&gt;x&lt;height&gt;x&lt;devicePixelRatio&gt;[,mobile][,touch][,landscape]'. 'touch' and 'mobile' to [`emulate`](#emulate) mobile devices. 'landscape' to [`emulate`](#emulate) landscape mode.

---

### `resize_page`

**Description:** Resize the window so the page content matches width x height (responsive layout debugging).

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `performance_analyze_insight`

**Description:** Expand one insight from the last trace (insightSetId + insightName from trace output).

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"
- **insightSetId** (string) **(required)**: The id for the specific insight set. Only use the ids given in the "Available insight sets" list.

---

### `performance_start_trace`

**Description:** Record a DevTools performance trace (reload optional). Use for load speed, main-thread jank, and Core Web Vitals—not Lighthouse scores.

**Parameters:**

- **autoStop** (boolean) _(optional)_: Determines if the trace recording should be automatically stopped.
- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).
- **reload** (boolean) _(optional)_: Determines if, once tracing has started, the current selected page should be automatically reloaded. Navigate the page to the right URL using the [`navigate_page`](#navigate_page) tool BEFORE starting the trace if reload or autoStop is set to true.

---

### `performance_stop_trace`

**Description:** Stop tracing and return trace summary; optional filePath for raw trace JSON (.json or .gz).

**Parameters:**

- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).

---

### `take_memory_snapshot`

**Description:** Write a .heapsnapshot for the current target; open in Memory panel to find leaks and retainers.

**Parameters:**

- **filePath** (string) **(required)**: A path to a .heapsnapshot file to save the heapsnapshot to.

---

## Network

### `get_network_request`

**Description:** Full request/response for a reqid from [`list_network_requests`](#list_network_requests); omit reqid to use the row selected in the Network panel.

**Parameters:**

- **reqid** (number) _(optional)_: The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.
- **requestFilePath** (string) _(optional)_: The absolute or relative path to save the request body to. If omitted, the body is returned inline.
- **responseFilePath** (string) _(optional)_: The absolute or relative path to save the response body to. If omitted, the body is returned inline.

---

### `list_network_requests`

**Description:** HTTP/S requests since navigation: URL, status, timing, size. Filter by resource type; paginate large logs.

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Set to true to return the preserved requests over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.

---

## Debugging

### `diff_computed_styles`

**Description:** Side-by-side style diff for two uids on the same page; optional geometry compare for layout-affecting changes.

**Parameters:**

- **uidA** (string) **(required)**: First element uid
- **uidB** (string) **(required)**: Second element uid
- **compareGeometry** (boolean) _(optional)_: If true, compare border-box geometry and classify effective layout change.
- **properties** (array) _(optional)_: Optional filter list

---

### `diff_computed_styles_snapshot`

**Description:** Compare live uid to [`save_computed_styles_snapshot`](#save_computed_styles_snapshot) baseline; domPath when uids differ between loads.

**Parameters:**

- **name** (string) **(required)**: Snapshot name
- **uid** (string) **(required)**: Element uid for the live node (from current snapshot)
- **compareGeometry** (boolean) _(optional)_: Compare border-box rects to detect effective layout change.
- **domPath** (string) _(optional)_: If baseline uid differs, match saved element by domPath from v1 snapshot.
- **properties** (array) _(optional)_: Optional filter list

---

### `evaluate_script`

**Description:** Run an async/sync function body in the page; result JSON-serializable. Pass snapshot element uids as args to receive DOM handles. For extensions, optional serviceWorkerId targets the worker.

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

---

### `get_box_model`

**Description:** CDP box model quads and rects for layout misalignment, overflow, and offset debugging.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `get_computed_styles`

**Description:** Resolved computed styles for one uid; optional property filter and winning-rule hints (includeSources). Prefer over scraping styles in [`evaluate_script`](#evaluate_script).

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **includeSources** (boolean) _(optional)_: If true, include best-effort winning rule origins
- **properties** (array) _(optional)_: Optional filter list

---

### `get_computed_styles_batch`

**Description:** Batch computed styles map keyed by uid—use for design tokens or multi-node parity checks.

**Parameters:**

- **uids** (array) **(required)**: The uids of elements on the page from the page content snapshot
- **properties** (array) _(optional)_: Optional filter list

---

### `get_console_message`

**Description:** Fetch one console entry by msgid from [`list_console_messages`](#list_console_messages) (stack, args, issue details).

**Parameters:**

- **msgid** (number) **(required)**: The msgid of a console message on the page from the listed console messages

---

### `get_visibility`

**Description:** Explain why an element is invisible (display, opacity, zero size, off-viewport, clip-path).

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `highlight_elements_for_styles`

**Description:** Highlight border quads in DevTools and return coordinates for screenshot overlays or docs.

**Parameters:**

- **uids** (array) **(required)**: Element uids from the current page snapshot

---

### `lighthouse_audit`

**Description:** Lighthouse a11y/SEO/best-practices only (HTML+JSON reports). For load/runtime timelines use [`performance_start_trace`](#performance_start_trace).

**Parameters:**

- **device** (enum: "desktop", "mobile") _(optional)_: Device to [`emulate`](#emulate).
- **mode** (enum: "navigation", "snapshot") _(optional)_: "navigation" reloads &amp; audits. "snapshot" analyzes current state.
- **outputDirPath** (string) _(optional)_: Directory for reports. If omitted, uses temporary files.

---

### `list_console_messages`

**Description:** Paginated console logs (and issues) since navigation; filter by type or include prior navigations.

**Parameters:**

- **includePreservedMessages** (boolean) _(optional)_: Set to true to return the preserved messages over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of messages to return. When omitted, returns all messages.
- **types** (array) _(optional)_: Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.

---

### `save_computed_styles_snapshot`

**Description:** Store baseline computed styles + domPath/meta under a name for cross-navigation regression checks.

**Parameters:**

- **name** (string) **(required)**: Snapshot name
- **uids** (array) **(required)**: The uids of elements on the page from the page content snapshot
- **properties** (array) _(optional)_: Optional filter list

---

### `take_screenshot`

**Description:** Capture PNG/JPEG/WebP of viewport, full page, or a uid element; use when pixels matter (layout, regressions), not for DOM structure.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted, takes a page screenshot.

---

### `take_snapshot`

**Description:** Accessibility tree with stable uids for automation. Always use the latest snapshot after DOM changes. Prefer over screenshot for structure; reflects Elements panel selection when set.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **verbose** (boolean) _(optional)_: Whether to include all possible information available in the full a11y tree. Default is false.

---
