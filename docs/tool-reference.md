<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

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
- **[Performance](#performance)** (3 tools)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (5 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`get_console_message`](#get_console_message)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)
- **[Element inspection](#element-inspection)** (17 tools)
  - [`capture_dom_snapshot`](#capture_dom_snapshot)
  - [`compare_elements`](#compare_elements)
  - [`force_element_state`](#force_element_state)
  - [`get_accessibility_info`](#get_accessibility_info)
  - [`get_css_variables`](#get_css_variables)
  - [`get_dom_tree`](#get_dom_tree)
  - [`get_element_at_position`](#get_element_at_position)
  - [`get_element_box_model`](#get_element_box_model)
  - [`get_element_event_listeners`](#get_element_event_listeners)
  - [`get_element_styles`](#get_element_styles)
  - [`get_fonts_info`](#get_fonts_info)
  - [`hide_highlight`](#hide_highlight)
  - [`highlight_element`](#highlight_element)
  - [`inspect_element`](#inspect_element)
  - [`query_selector`](#query_selector)
  - [`search_dom`](#search_dom)
  - [`show_layout_overlay`](#show_layout_overlay)

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

### `press_key`

**Description:** Press a key or key combination. Use this when other input methods like [`fill`](#fill)() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

**Parameters:**

- **key** (string) **(required)**: A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta

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

- **ignoreCache** (boolean) _(optional)_: Whether to ignore cache on reload.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **type** (enum: "url", "back", "forward", "reload") _(optional)_: Navigate the page by URL, back or forward in history, or reload.
- **url** (string) _(optional)_: Target URL (only type=url)

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

### `emulate`

**Description:** Emulates various features on the selected page.

**Parameters:**

- **cpuThrottlingRate** (number) _(optional)_: Represents the CPU slowdown factor. Set the rate to 1 to disable throttling. If omitted, throttling remains unchanged.
- **networkConditions** (enum: "No emulation", "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: Throttle network. Set to "No emulation" to disable. If omitted, conditions remain unchanged.

---

### `resize_page`

**Description:** Resizes the selected page's window so that the page has specified dimension

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `performance_analyze_insight`

**Description:** Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"
- **insightSetId** (string) **(required)**: The id for the specific insight set. Only use the ids given in the "Available insight sets" list.

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

**Description:** Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

**Parameters:**

- **reqid** (number) _(optional)_: The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Set to true to return the preserved requests over the last 3 navigations.
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
- **function** (string) **(required)**: A JavaScript function declaration to be executed by the tool in the currently selected page.
  Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
  Example with arguments: `(el) => {
  return el.innerText;
}`

---

### `get_console_message`

**Description:** Gets a console message by its ID. You can get all messages by calling [`list_console_messages`](#list_console_messages).

**Parameters:**

- **msgid** (number) **(required)**: The msgid of a console message on the page from the listed console messages

---

### `list_console_messages`

**Description:** List all console messages for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedMessages** (boolean) _(optional)_: Set to true to return the preserved messages over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of messages to return. When omitted, returns all requests.
- **types** (array) _(optional)_: Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.

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

**Description:** Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **verbose** (boolean) _(optional)_: Whether to include all possible information available in the full a11y tree. Default is false.

---

## Element inspection

### `capture_dom_snapshot`

**Description:** Capture a complete DOM snapshot with computed styles for all elements.
This is an efficient way to get DOM structure and styles in a single call.
Useful for analyzing entire page layouts or large sections.

**Parameters:**

- **computedStyles** (array) _(optional)_: CSS properties to capture (default: display, color, background-color, font-size, etc.)

---

### `compare_elements`

**Description:** Compare two elements' styles and attributes to understand their differences.
Returns a diff of computed styles, showing which properties differ between elements.
Useful for debugging inconsistent styling or understanding variations.

**Parameters:**

- **properties** (array) _(optional)_: CSS properties to compare (default: common layout/visual properties)
- **uid1** (string) **(required)**: First element UID
- **uid2** (string) **(required)**: Second element UID

---

### `force_element_state`

**Description:** Force an element into specific CSS pseudo-states for inspection.
Use this to inspect :[`hover`](#hover), :active, :focus styles without actually interacting with the element.
Multiple states can be forced simultaneously.

**Parameters:**

- **states** (array) **(required)**: Pseudo-states to force (e.g., ["[`hover`](#hover)", "focus"])
- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `get_accessibility_info`

**Description:** Get detailed accessibility information for an element.
Returns ARIA roles, states, properties, and the accessibility tree node.
Useful for ensuring proper accessibility implementation.

**Parameters:**

- **includeAncestors** (boolean) _(optional)_: Include accessibility info for ancestor elements
- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `get_css_variables`

**Description:** Get CSS custom properties (variables) that apply to an element.
Returns both the variables defined on the element and inherited variables.
Useful for understanding design systems and theming.

**Parameters:**

- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `get_dom_tree`

**Description:** Get the DOM tree structure starting from a specific element or document root.
Returns a hierarchical view of elements with their tag names and key attributes.
Useful for understanding the structure of a component or page section.

**Parameters:**

- **depth** (integer) _(optional)_: How deep to traverse the tree
- **uid** (string) _(optional)_: Element UID to start from (omit for document root)

---

### `get_element_at_position`

**Description:** Get the element at specific x,y coordinates on the page.
Returns basic information about the topmost element at that position.
Useful for identifying elements at specific visual locations.

**Parameters:**

- **x** (integer) **(required)**: X coordinate on the page
- **y** (integer) **(required)**: Y coordinate on the page

---

### `get_element_box_model`

**Description:** Get the box model (layout) information for an element.
Returns content, padding, border, and margin dimensions.
This is equivalent to the box model diagram shown in Chrome DevTools.

**Parameters:**

- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `get_element_event_listeners`

**Description:** Get all event listeners attached to an element.
Returns the event type, handler function preview, and listener options.
Useful for understanding element interactivity.

**Parameters:**

- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `get_element_styles`

**Description:** Get CSS styles for an element including computed styles, matched CSS rules, and inherited styles.
This is equivalent to the "Styles" panel in Chrome DevTools Elements tab.
Use this to understand how an element is styled and copy styles from websites.

**Parameters:**

- **includeComputed** (boolean) _(optional)_: Include final computed style values
- **includeInherited** (boolean) _(optional)_: Include styles inherited from ancestor elements
- **properties** (array) _(optional)_: Filter to specific CSS properties (e.g., ["color", "font-size"]). If omitted, returns common properties.
- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `get_fonts_info`

**Description:** Get information about fonts used to render text in an element.
Shows which fonts are actually being used (may differ from CSS font-family).
Useful for understanding typography and font fallbacks.

**Parameters:**

- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `hide_highlight`

**Description:** Hide any active element highlight on the page.

**Parameters:** None

---

### `highlight_element`

**Description:** Visually highlight an element on the page with a colored overlay.
Useful for verifying you've identified the correct element.
The highlight shows content (blue), padding (green), border (yellow), and margin (orange).

**Parameters:**

- **duration** (integer) _(optional)_: How long to show highlight in milliseconds (0 = until [`hide_highlight`](#hide_highlight) is called)
- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `inspect_element`

**Description:** Get comprehensive information about an element including its HTML, attributes, and position.
This is equivalent to inspecting an element in Chrome DevTools Elements panel.
Returns tag name, id, classes, all attributes, outer HTML, and box model dimensions.

**Parameters:**

- **includeHtml** (boolean) _(optional)_: Include the outer HTML of the element
- **maxHtmlLength** (integer) _(optional)_: Maximum length of HTML to return (truncated if longer)
- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---

### `query_selector`

**Description:** Find elements using CSS selectors.
Returns element information for matching elements.
Use this to find elements by class, id, tag, or complex CSS selectors.

**Parameters:**

- **all** (boolean) _(optional)_: Return all matching elements vs just the first match
- **limit** (integer) _(optional)_: Maximum number of elements to return when all=true
- **selector** (string) **(required)**: CSS selector (e.g., ".btn-primary", "#header", "div.container > p")

---

### `search_dom`

**Description:** Search the DOM for elements matching a text query, CSS selector, or XPath.
Returns matching elements with their basic information.
Supports plain text search, CSS selectors, and XPath expressions.

**Parameters:**

- **limit** (integer) _(optional)_: Maximum results to return
- **query** (string) **(required)**: Search query - text content, CSS selector, or XPath expression

---

### `show_layout_overlay`

**Description:** Show CSS Grid or Flexbox layout overlay for an element.
Visualizes grid lines, flex containers, gaps, and alignment.
Helps understand and debug complex layouts.

**Parameters:**

- **type** (enum: "grid", "flex") **(required)**: Type of layout overlay to show
- **uid** (string) **(required)**: Element UID from snapshot (e.g., "42_5")

---
