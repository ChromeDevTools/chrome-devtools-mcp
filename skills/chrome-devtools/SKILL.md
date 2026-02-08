---
name: chrome-devtools
description: Uses Chrome DevTools via MCP for debugging, browser automation, web scraping with Puppeteer, WebSocket inspection, performance analysis, and network debugging. Use when automating browsers, scraping pages, intercepting or analyzing WebSocket traffic, debugging web apps, or recording performance traces.
---

## Project overview

**Chrome DevTools MCP** is an MCP server that controls a live Chrome instance via Puppeteer and Chrome DevTools Protocol (CDP). It gives AI assistants tools for navigation, interaction, snapshots, network inspection (including WebSocket), console messages, performance traces, and script evaluation. The server starts Chrome on first tool use; you can also connect to an existing Chrome with `--browser-url` or `--wsEndpoint`.

- **Docs**: [Tool reference](../../docs/tool-reference.md), [Design principles](../../docs/design-principles.md), [Troubleshooting](../../docs/troubleshooting.md)
- **Puppeteer**: Used under the hood for browser launch, pages, and CDP; you interact via MCP tools, not Puppeteer API directly.

## Core concepts

**Browser lifecycle**: Browser starts automatically on first tool call using a persistent Chrome profile. Configure via CLI args in the MCP server configuration: `npx chrome-devtools-mcp@latest --help`.

**Page selection**: Tools operate on the currently selected page. Use `list_pages` to see available pages, then `select_page` to switch context.

**Element interaction**: Use `take_snapshot` to get page structure with element `uid`s. Each element has a unique `uid` for interaction. If an element isn't found, take a fresh snapshot—the element may have been removed or the page changed.

## Discovering scraping opportunities (Network-first)

**Best first step**: Use the **Network** tools to see *how* the page gets its data. Many sites load content via **XHR** or **fetch**; if you find that API and its response is JSON (or structured), you can often use the same API instead of parsing HTML.

1. **Load and trigger**: `navigate_page` to the target URL; if needed, interact (click, search) so the data you want is loaded.
2. **List API requests**: `list_network_requests` with **resourceTypes: `['xhr', 'fetch']`** to see only API-style requests. Scan for URLs that look like data endpoints (e.g. `api/`, `graphql`, query params).
3. **Inspect one**: `get_network_request(reqid)` for a promising request. Check **response body**—if it’s JSON with the data you need, prefer **reusing that API** (same URL, method, headers, body) over DOM scraping.
4. **Decide**: Structured response → use the API. No usable API or auth-only → use DOM: snapshot + `evaluate_script` (see “Workflow: Web scraping” below).

Full step-by-step and “API vs DOM” guidance: [network-for-scraping-discovery.md](./network-for-scraping-discovery.md).

## Workflow: Web scraping (Puppeteer-style)

Use the MCP tools as a “Puppeteer-like” scraping pipeline: navigate, wait, snapshot, then extract data with snapshots and/or page scripts.

1. **Navigate**: `navigate_page` (type=url, url=…) or `new_page` (url=…).
2. **Wait**: `wait_for` (text=…) to wait for specific content, or use a short delay and then snapshot.
3. **Snapshot**: `take_snapshot` to get the accessibility tree and element `uid`s. Prefer snapshot over screenshot for automation (faster, text-based).
4. **Extract**:
   - **From tree**: Use the snapshot text and structure; click/fill by `uid` if you need to open modals or paginate.
   - **From page**: Use `evaluate_script` to run JavaScript in the page and return JSON-serializable data (e.g. `() => document.querySelectorAll('h2').length`, or extract table rows, meta tags, or any DOM/data).
5. **Pagination or multi-page**: Use `click` on “next” (by `uid`), then wait + snapshot again, or `navigate_page` to new URLs and repeat.

**Tips**: Use `filePath` on `take_snapshot` for large pages. For data not in the a11y tree (e.g. attributes, computed styles), use `evaluate_script`. Iframes are not in the snapshot—only the main frame is represented.

## Workflow: WebSocket inspection / “interception”

The server does not inject code into the page; it uses DevTools network data. You can **list and inspect** WebSocket (and other) requests.

1. **Navigate** to the page that opens WebSockets: `navigate_page` (url=…).
2. **Trigger** the WebSocket (use the app or wait for it to connect).
3. **List requests**: `list_network_requests` with `resourceTypes: ['websocket']` to see only WebSocket requests. Omit `resourceTypes` to see all (document, xhr, fetch, websocket, etc.).
4. **Inspect one request**: `get_network_request` with the `reqid` from the list. Use `requestFilePath` / `responseFilePath` to save bodies to files (useful for large or binary payloads).

**Resource types** (for `list_network_requests`) include: `document`, `stylesheet`, `image`, `media`, `font`, `script`, `xhr`, `fetch`, `eventsource`, **`websocket`**, `manifest`, `ping`, `preflight`, `other`, etc. Use these to filter by kind of traffic.

**Note**: You see WebSocket *requests* (URL, timing, headers). Live message-by-message capture is limited to what DevTools exposes in the network list and request/response details.

## General workflow (before interacting)

1. Navigate: `navigate_page` or `new_page`
2. Wait: `wait_for` if you know what text to wait for
3. Snapshot: `take_snapshot` to get structure and `uid`s
4. Interact: Use `uid`s from snapshot for `click`, `fill`, `fill_form`, `hover`, `drag`, `press_key`, `upload_file`
5. Dialogs: Use `handle_dialog` (accept/dismiss, optional `promptText`) when alerts/confirms appear

## Tool selection quick reference

| Goal | Preferred tool(s) |
|------|-------------------|
| Automation / scraping | `take_snapshot`, `click`, `fill`, `evaluate_script` |
| Visual check | `take_screenshot` (optionally `fullPage`, `uid` for element) |
| Data not in a11y tree | `evaluate_script` (must return JSON-serializable values) |
| List HTTP/WebSocket requests | `list_network_requests` (optional `resourceTypes: ['websocket']`) |
| Inspect one request/response | `get_network_request` (reqid, optional file paths for bodies) |
| Console errors/warnings | `list_console_messages` (optional `types`), `get_console_message` |
| Performance / CWV | `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight` |
| Emulation | `emulate` (viewport, userAgent, networkConditions, etc.), `resize_page` |

See [Tool reference](../../docs/tool-reference.md) for full parameters.

## Formatters (internal)

Tool responses are shaped by internal formatters. You don’t call them directly; they affect what the agent sees:

- **SnapshotFormatter**: Turns the a11y tree into the text snapshot with `uid`s and optional “selected in DevTools” hint. Use `verbose: true` on `take_snapshot` for more detail.
- **NetworkFormatter**: Formats request/response (URL, status, headers, body). Large bodies can be truncated or written to `requestFilePath`/`responseFilePath`.
- **ConsoleFormatter**: Formats console messages (level, text, stack, resolved arguments when detailed data is requested).
- **IssueFormatter**: Formats DevTools “issues” (e.g. deprecations, violations) when included in responses.

A full **Network & Console breakdown** (data flow, collectors, filter options, what you see in responses) is in [network-and-console-breakdown.md](./network-and-console-breakdown.md).

## Telemetry

Google collects usage statistics (e.g. tool invocation success, latency, environment) to improve the server. Collection is **on by default**.

- **Opt-out**: Start the server with `--no-usage-statistics` (or set `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` or `CI`).
- **Config example**: `"args": ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"]`
- Data is handled per [Google Privacy Policy](https://policies.google.com/privacy); independent of Chrome browser metrics.

## Efficient usage

- Use `filePath` for large outputs (screenshots, snapshots, traces, request/response bodies).
- Use pagination (`pageIdx`, `pageSize`) and filters (`resourceTypes`, `types` for console) to limit data.
- Set `includeSnapshot: false` on input actions (click, fill, etc.) unless you need an updated snapshot in the same response.
- Run independent tool calls in parallel when order allows (e.g. multiple `get_network_request` by reqid); keep sequence for navigate → wait → snapshot → interact.

## Troubleshooting

If the MCP tools are insufficient, suggest using Chrome DevTools directly:

- https://developer.chrome.com/docs/devtools
- https://developer.chrome.com/docs/devtools/ai-assistance

For connection issues, headless vs headed, or remote debugging, see [Troubleshooting](../../docs/troubleshooting.md).
