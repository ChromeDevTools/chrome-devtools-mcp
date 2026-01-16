# Chrome DevTools MCP Extension

This extension enables you to control a real Chrome browser instance to inspect, debug, and automate web interactions via the Model Context Protocol (MCP).

## Core Capabilities & Tools

You have access to a suite of tools categorized by function. Use these tools to perform actions in the browser.

### 1. Navigation & Page Management
- **`new_page({ url })`**: Open a new tab/window with the specified URL.
- **`navigate_page({ url })`**: Navigate the *currently selected* page to a new URL.
- **`list_pages()`**: List all open tabs/pages. **Always check this first** if you are unsure of the current browser state or which page is active.
- **`select_page({ pageIdx })`**: Switch the active context to a different tab by its index (from `list_pages`).
- **`close_page({ pageIdx })`**: Close a specific tab.

### 2. Interaction (Input)
*Note: Most interaction tools require a `uid` (Unique Identifier) for the target element.*

- **`click({ uid })`**: Click an element identified by its `uid`.
- **`fill({ uid, value })`**: Type text into an input field identified by its `uid`.
- **`press_key({ key })`**: Send keyboard events (e.g., 'Enter', 'Tab', 'ArrowDown'). Useful when specific UI elements are hard to target or for global shortcuts.
- **`hover({ uid })`**: Hover the mouse cursor over an element.
- **`drag({ from_uid, to_uid })`**: Drag an element to another location.

### 3. Inspection & Debugging
- **`take_snapshot()`**: **CRITICAL TOOL.** Returns a structural representation (Accessibility Tree) of the current page with `uid`s for every interactable element.
    - **Usage**: Call this *before* trying to click or fill anything to find the correct `uid`.
- **`take_screenshot()`**: Captures a visual screenshot of the current viewport or specific element. Use this when visual verification is needed.
- **`list_console_messages()`**: specific debugging of JavaScript errors or logs.
- **`evaluate_script({ function })`**: Execute custom JavaScript in the page context.
    - **Usage**: Best for complex data extraction (scraping) or interactions that standard tools cannot handle.

### 4. Network & Performance
- **`list_network_requests()`**: View recent network activity. Useful for debugging API calls or resource loading issues.
- **`performance_start_trace()` / `performance_stop_trace()`**: Record a performance profile to analyze loading speed or runtime performance.

## Operational Guidelines

1.  **The "Snapshot-First" Workflow**:
    - You cannot interact with elements using CSS selectors or XPaths directly in tool calls.
    - **Step 1**: Call `take_snapshot()` to get the current page structure.
    - **Step 2**: Analyze the returned tree to find the `uid` of the element you want (e.g., a button with text "Submit").
    - **Step 3**: Call `click({ uid: "..." })` using that specific ID.
    - *Do not guess UIDs.* They are dynamic and generated per snapshot.

    - **Browser Context**:
    - This extension controls a *specific* Chrome instance with its own dedicated profile.
    - By default, this profile **persists** between sessions (in your cache) but is **separate** from your main personal Chrome profile.
    - Do not assume you have access to the user's personal cookies, sessions, or history unless explicitly stated.

3.  **Handling Dynamic Content**:
    - After an action that loads new content (like clicking "Next"), the page might take a moment to update.
    - Use `wait_for({ text: "..." })` if you need to ensure specific content is visible before proceeding.
    - If an action fails with "element not found", the page likely updated. Run `take_snapshot()` again to get fresh UIDs.

4.  **Debugging vs. Visuals**:
    - Use `take_snapshot` for *functional* understanding (what can I click?).
    - Use `take_screenshot` for *visual* understanding (does this look right?).

## Common Troubleshooting

- **If `take_snapshot` returns too much data**: The output might be truncated. Focus on specific sections if possible, or use `evaluate_script` to query specific properties.
- **If the browser seems stuck**: Use `navigate_page({ type: "reload" })` to refresh.
- **If tool calls fail repeatedly**: The `uid`s might be stale. Always refresh your knowledge of the page with a new `take_snapshot` after significant interactions.
