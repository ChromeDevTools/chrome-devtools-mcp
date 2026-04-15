# Chrome DevTools MCP — tools user guide

This guide explains **when and how** to use each MCP tool. For parameter details, see [tool-reference.md](./tool-reference.md).

## Core workflow (recommended)

1. **`list_pages`** — See open tabs; note `pageId` for the tab you care about.
2. **`select_page`** — Target that tab for subsequent tools (unless you only
   have one page).
3. **`take_snapshot`** — Get the accessibility tree with **`uid`** values
   for elements. **Prefer this over screenshots** for structure and automation.
4. Act (navigate, click, fill, etc.), then **`take_snapshot`** again when the
   DOM may have changed.

**uids expire** when the page updates. Always use the **latest** snapshot.

---

## Navigation automation

### `list_pages`

- **Use when:** You need to know which tabs exist, their URLs, or which `pageId` to pass to `select_page` / `close_page`.
- **Typical scenario:** Multi-tab debugging; picking the tab that shows the bug.

### `select_page`

- **Use when:** More than one tab is open, or you need to switch context.
- **Pairs with:** Every page-scoped tool after switching tabs.

### `new_page`

- **Use when:** You need a fresh tab, a specific URL in isolation, or an
  **`isolatedContext`** (separate cookies/storage from the default profile).
- **Typical scenario:** Testing logged-out vs logged-in side by side.

### `navigate_page`

- **Use when:** Loading a URL, going **back/forward**, **reload** (optionally
  **ignore cache**), or injecting an **init script** before the next document.
- **Prefer over** asking the user to open links manually.

### `close_page`

- **Use when:** Cleaning up extra tabs. **Cannot** close the last remaining page.

### `wait_for`

- **Use when:** The UI updates asynchronously; wait until **any** of the given
  strings appears before continuing.
- **Pairs with:** `take_snapshot` after the wait.

### `get_tab_id` _(experimental)_

- **Use when:** Integrating with external tooling that needs the Chrome **tab
  ID** for the selected page.

---

## Input automation

All of these need **`uid`** values from **`take_snapshot`** (except
`type_text`, which uses the focused element).

### `click`

- **Use when:** Activating buttons, links, controls, or opening menus.
- **Tip:** Use **`dblClick`** when a double-click is required.

### `click_at` _(experimental vision)_

- **Use when:** You must hit **pixel coordinates** (e.g. canvas, non-a11y
  overlay) and **`uid`-based `click`** is not enough.

### `hover`

- **Use when:** Revealing tooltips, mega-menus, or hover-only controls before
  another action.

### `fill`

- **Use when:** Setting **inputs**, **text areas**, **`<select>`**, or
  combobox-like controls with option children.
- **Prefer over** `type_text` when you have a clear field `uid`.

### `fill_form`

- **Use when:** Many fields should be set in one pass (forms, wizards).

### `type_text`

- **Use when:** Simulating **keystrokes** after focus (e.g. contenteditable,
  IME-heavy fields). Optional **`submitKey`** (e.g. Enter).

### `press_key`

- **Use when:** Shortcuts (**Ctrl+R**), Escape, Tab navigation, or keys that
  **`fill`** does not model.

### `drag`

- **Use when:** Drag-and-drop between two elements identified by **`from_uid`**
  and **`to_uid`**.

### `upload_file`

- **Use when:** Attaching a file; pass a real **`filePath`** on the MCP host.

### `handle_dialog`

- **Use when:** **`alert` / `confirm` / `prompt`** blocks automation; accept
  or dismiss, with optional **`promptText`**.

---

## Emulation

### `emulate`

- **Use when:** Reproducing **mobile**, **slow network**, **CPU throttling**,
  **geolocation**, **user agent**, **dark/light**, or **viewport** conditions.
- **Typical scenario:** “Why does this break on slow 3G?” or “Does dark mode
  break contrast?”

### `resize_page`

- **Use when:** You need an exact **content** width/height (layout breakpoints,
  responsive bugs).

---

## Debugging (DOM, visuals, scripts)

### `take_snapshot`

- **Use when:** You need **structure, roles, names, and uids** for automation or
  reasoning about the page.
- **Prefer over** `take_screenshot` for “what can I click?” questions.

### `take_screenshot`

- **Use when:** You need **pixels** (visual regression, layout proof, sharing
  with a human). Optional **element `uid`**, **`fullPage`**, or **`filePath`**.

### `evaluate_script`

- **Use when:** Reading **`window` state**, calling page APIs, or extracting
  data **as JSON**. Pass element **`uid`s** as **`args`** when the script
  should receive DOM nodes.
- **Not for:** Long arbitrary scripts without a return value—keep functions
  **JSON-serializable**.

### `list_console_messages` / `get_console_message`

- **Use when:** Investigating **errors, warnings, logs**, or **DevTools issues**
  after navigation or interaction.
- **Flow:** List to get **`msgid`**, then fetch full detail for one message.

### `lighthouse_audit`

- **Use when:** You want **a11y, SEO, best-practices** scores and reports
  (HTML/JSON). **Does not** replace performance tracing for load timelines.
- **Performance:** Use **`performance_start_trace`** / **`performance_stop_trace`**.

### Style, layout, and comparison tools

| Tool                                | Use when                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| **`get_computed_styles`**           | Inspect **resolved CSS** for one node; optional **rule origins**.                 |
| **`get_computed_styles_batch`**     | Same for **many uids** (design-system parity checks).                             |
| **`get_box_model`**                 | **Padding/margin/content** quads and geometry debugging.                          |
| **`get_visibility`**                | “Why is this invisible?” (**display**, **opacity**, off-screen, etc.).            |
| **`diff_computed_styles`**          | **Side-by-side** two elements (A vs B) on the **same** page.                      |
| **`save_computed_styles_snapshot`** | **Baseline** captured styles + meta for later comparison.                         |
| **`diff_computed_styles_snapshot`** | Compare **live** node to a **saved** baseline; use **`domPath`** if uids drifted. |
| **`highlight_elements_for_styles`** | Draw **DevTools overlays** and return **border quads** for external diagrams.     |

**Typical comparison flow:** `take_snapshot` → `save_computed_styles_snapshot`
→ change URL or code → `take_snapshot` → `diff_computed_styles_snapshot`.

### `screencast_start` / `screencast_stop` _(experimental)_

- **Use when:** You need a **video** repro (MP4). Requires **ffmpeg** on PATH.

---

## Network

### `list_network_requests`

- **Use when:** Seeing **what loaded**, **failed**, or **order/timing** of
  requests since navigation. Filter by **resource type** or paginate.

### `get_network_request`

- **Use when:** Inspecting **headers, bodies, status** for one request.
  Omit **`reqid`** to use the row **selected in the DevTools Network panel**.
- **Tip:** Save large bodies with **`requestFilePath`** / **`responseFilePath`**.

---

## Performance and memory

### `performance_start_trace` / `performance_stop_trace`

- **Use when:** Diagnosing **load performance**, **main-thread jank**,
  **LCP/INP/CLS**, or sharing a **trace** file.
- **Note:** Default flow reloads the page; navigate first if **`reload`** is
  used as intended.

### `performance_analyze_insight`

- **Use when:** A trace is done and you need **deeper detail** on one
  **insight** (ids/names come from the trace summary).

### `take_memory_snapshot`

- **Use when:** **Heap leaks** or retaining paths; produces a **`.heapsnapshot`**
  for Chrome DevTools Memory panel.

---

## Extensions _(experimental)_

### `install_extension` / `uninstall_extension` / `list_extensions` / `reload_extension`

- **Use when:** Testing **unpacked** extensions or automating extension
  lifecycle during E2E.

### `trigger_extension_action`

- **Use when:** Clicking the extension **toolbar action** programmatically.

---

## In-page tools _(experimental)_

Pages can expose **`window.__dtmcp`** tools (schemas defined by the app).

### `list_in_page_tools`

- **Use when:** The app under test registers **custom diagnostics** (feature
  flags, store state, etc.).

### `execute_in_page_tool`

- **Use when:** Calling those tools with **JSON `params`**; **`{ "uid": "…" }`**
  in params is resolved to a real element.

---

## Slim mode (`--slim`)

For minimal deployments, the server exposes only:

| Tool             | Role                                |
| ---------------- | ----------------------------------- |
| **`screenshot`** | Viewport PNG to a temp path         |
| **`navigate`**   | `goto` a URL                        |
| **`evaluate`**   | Run a script string; result as text |

Use full mode for **network, console, performance, styles, and snapshot-based
automation**.

---

## Choosing tools vs generic web search

- **Prefer this MCP** when the task needs **ground truth** from a real browser:
  computed styles, traces, network waterfalls, console stacks, or reproducible
  clicks tied to the a11y tree.
- **Prefer crawling/search** for **documentation or third-party content** you
  are not loading in the instrumented Chrome instance.

---

## See also

- [Tool reference](./tool-reference.md) — full schemas
- [Slim tool reference](./slim-tool-reference.md)
- [Troubleshooting](./troubleshooting.md)
- [CLI options](../README.md) — flags that enable experimental categories
