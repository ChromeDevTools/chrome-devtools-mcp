# Network & Console in Chrome DevTools MCP – Breakdown

This document explains how the **Network** and **Console** panels in Chrome DevTools map to this MCP server: data sources, tools, formatters, and what you see in responses.

---

## 1. Network (DevTools → MCP)

### What DevTools exposes

The Chrome DevTools **Network** panel shows every request made by the page: document, XHR/fetch, scripts, styles, images, **WebSocket**, etc. Each request has URL, method, status, timing, headers, and request/response bodies. The MCP server uses the same underlying data (Puppeteer’s `HTTPRequest` from the `request` event).

### Data flow in this project

```
Page "request" event (Puppeteer)
    → NetworkCollector (PageCollector<HTTPRequest>)
    → stored per page, per navigation (last 3 navigations)
    → McpContext.getNetworkRequests() / getNetworkRequestById()
    → McpResponse: NetworkFormatter (summary or detailed)
    → tool response text + structuredContent
```

- **NetworkCollector** (`PageCollector.ts`): Subscribes to each page’s `request` event. On main-frame navigation it splits storage so “current” requests are the ones since the last navigation. Preserves up to 3 navigations when `includePreservedRequests` is true.
- **Stable ID**: Each request gets a numeric `reqid` (stable for the session) so you can refer to it in `get_network_request(reqid)`.

### MCP tools

| Tool | Purpose |
|------|--------|
| **list_network_requests** | List requests for the selected page (current navigation, or last 3 if `includePreservedRequests: true`). Optional: `pageSize`, `pageIdx`, **`resourceTypes`**, `includePreservedRequests`. |
| **get_network_request** | Get one request by `reqid` (or the request currently selected in DevTools UI if no reqid). Optional: `requestFilePath`, `responseFilePath` to save bodies to files. |

### Resource types (filtering)

Use **`resourceTypes`** in `list_network_requests` to filter. Allowed values (same as DevTools):

| Type | Typical use |
|------|-------------|
| `document` | Main document / navigations |
| `stylesheet` | CSS |
| `script` | JS |
| `image`, `media`, `font` | Assets |
| `xhr`, `fetch` | API / fetch() |
| **`websocket`** | WebSocket connections |
| `eventsource` | Server-Sent Events |
| `manifest`, `ping`, `preflight`, `other`, etc. | Other |

Example: only WebSockets → `resourceTypes: ['websocket']`.

### What you see in the response

- **List (summary)**: For each request, one line like:  
  `reqid=<id> <method> <url> [success - 200]` (or `[failed - ...]`, `[pending]`). Optionally `[selected in the DevTools Network panel]` if it matches the DevTools selection.
- **Single request (detailed)** from `get_network_request`: Request URL, status, request headers, request body (or “saved to …”), response headers, response body (or “saved to …”), failure text if any, redirect chain. Large bodies are truncated in-line or written to the path you passed.

### Formatter (internal)

**NetworkFormatter** (`formatters/NetworkFormatter.ts`):

- **Summary**: `toString()` → one line (reqid, method, URL, status).
- **Detailed**: `toStringDetailed()` → full headers and bodies (or file path when saved). Used when you call `get_network_request`.
- **Bodies**: Truncated to 10k chars in-line; use `requestFilePath` / `responseFilePath` for large or binary data.

---

## 2. Console (DevTools → MCP)

### What DevTools exposes

The Chrome DevTools **Console** panel shows:

- **Console messages**: `console.log`, `console.error`, `console.warn`, etc., plus type (log, debug, info, error, warn, dir, table, trace, …).
- **Uncaught exceptions**: Runtime errors (from CDP `Runtime.exceptionThrown`).
- **Issues**: Aggregated DevTools “issues” (e.g. deprecations, violations) from the Audits/Issues system (CDP `Audits.issueAdded`).

The MCP server collects all of these and exposes them as a single list with a stable numeric **msgid** per entry.

### Data flow in this project

```
Page / CDP events
    → ConsoleCollector (PageCollector<ConsoleMessage | Error | AggregatedIssue>)
    → PageEventSubscriber: console, uncaughtError, issue
    → stored per page, per navigation (last 3 navigations)
    → McpContext.getConsoleData() / getConsoleMessageById()
    → McpResponse: ConsoleFormatter or IssueFormatter
    → tool response text + structuredContent
```

- **ConsoleCollector** (`PageCollector.ts`): Extends `PageCollector`; each page gets a **PageEventSubscriber** that:
  - Listens to the page’s **console** event (Puppeteer) for `console.*` messages.
  - Listens to CDP **Runtime.exceptionThrown** and emits **uncaughtError** (wrapped as `Error`-like).
  - Enables **Audits** and listens to **Audits.issueAdded**, then uses DevTools’ **IssueAggregator** to emit **issue** (AggregatedIssue).
- Storage is split on main-frame navigation; you can ask for messages from the last 3 navigations with `includePreservedMessages: true`.

### MCP tools

| Tool | Purpose |
|------|--------|
| **list_console_messages** | List console messages (and issues/uncaught errors) for the selected page. Optional: `pageSize`, `pageIdx`, **`types`**, `includePreservedMessages`. |
| **get_console_message** | Get one message by **msgid** with full detail (resolved arguments, stack trace for console messages; issue description and affected resources for issues). |

### Message types (filtering)

Use **`types`** in `list_console_messages` to filter. Allowed values:

- **Console**: `log`, `debug`, `info`, `error`, `warn`, `dir`, `dirxml`, `table`, `trace`, `clear`, `startGroup`, `startGroupCollapsed`, `endGroup`, `assert`, `profile`, `profileEnd`, `count`, `timeEnd`, `verbose`.
- **Special**: `issue` (DevTools aggregated issues), and uncaught errors are treated as type `error`.

Example: only errors and issues → `types: ['error', 'issue']`.

### What you see in the response

- **List (summary)**: For each message, one line:  
  `msgid=<id> [<type>] <text> (N args)`  
  For issues: `msgid=<id> [issue] <title> (count: N)`.
- **Single message (detailed)** from `get_console_message`:
  - **Console message**: ID, type, message text, **Arguments** (resolved values), **Stack trace** (with file:line when available).
  - **Issue**: ID, description (markdown), “Learn more” links, **Affected resources** (e.g. request reqid, element uid).
  - **Uncaught error**: ID, message, stack.

### Formatters (internal)

- **ConsoleFormatter** (`formatters/ConsoleFormatter.ts`):
  - **Summary**: `toString()` → `msgid=X [type] text (N args)`.
  - **Detailed**: `toStringDetailed()` → ID, message, Arguments, Stack trace. For detailed, it can resolve `args` via `jsonValue()` and resolve stack via DevTools (when available).
- **IssueFormatter** (`formatters/IssueFormatter.ts`):
  - **Summary**: `toString()` → `msgid=X [issue] title (count: N)`.
  - **Detailed**: `toStringDetailed()` → ID, description, links, affected resources (request id, element uid, etc.).

---

## 3. Side-by-side summary

| Aspect | Network | Console |
|--------|---------|--------|
| **DevTools panel** | Network | Console (+ Issues) |
| **Data source** | Page `request` (Puppeteer) | Page `console` + CDP `Runtime.exceptionThrown` + CDP `Audits.issueAdded` |
| **Collector** | NetworkCollector (PageCollector&lt;HTTPRequest&gt;) | ConsoleCollector (PageCollector&lt;ConsoleMessage \| Error \| AggregatedIssue&gt;) |
| **List tool** | list_network_requests | list_console_messages |
| **Get-one tool** | get_network_request(reqid) | get_console_message(msgid) |
| **Filter param** | resourceTypes (e.g. websocket, xhr, fetch) | types (e.g. error, log, issue) |
| **Stable ID** | reqid (number) | msgid (number) |
| **Preserved data** | includePreservedRequests (last 3 navs) | includePreservedMessages (last 3 navs) |
| **Formatter** | NetworkFormatter (summary vs detailed; body truncation / file) | ConsoleFormatter, IssueFormatter (summary vs detailed; args + stack) |

---

## 4. Practical usage

- **Network**: Navigate → trigger traffic → `list_network_requests` (optionally `resourceTypes: ['websocket']` or `['xhr','fetch']`) → use a `reqid` in `get_network_request` for headers/bodies; use `requestFilePath`/`responseFilePath` for large payloads.
- **Console**: After load or action → `list_console_messages` (optionally `types: ['error','issue']`) → use a `msgid` in `get_console_message` for full stack and resolved arguments.

Both use the same **selected page** and support **pagination** (`pageSize`, `pageIdx`) in the list tools.
