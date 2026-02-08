# Chrome DevTools MCP – Quick reference

Use this alongside [SKILL.md](./SKILL.md). Full parameter details: [docs/tool-reference.md](../../docs/tool-reference.md).  
**Network & Console deep dive**: [network-and-console-breakdown.md](./network-and-console-breakdown.md).  
**Using Network to discover scraping opportunities**: [network-for-scraping-discovery.md](./network-for-scraping-discovery.md).

## Tools by category

### Input automation (8)
- **click** – Click element by `uid` (optional `dblClick`)
- **drag** – `from_uid`, `to_uid`
- **fill** – Type into input/textarea or select option by `uid`, `value`
- **fill_form** – Fill multiple elements at once (`elements`: `[{uid, value}, …]`)
- **handle_dialog** – accept / dismiss; optional `promptText`
- **hover** – Hover by `uid`
- **press_key** – e.g. `"Enter"`, `"Control+A"`
- **upload_file** – `uid` (file input), `filePath` (local path)

### Navigation (6)
- **list_pages** – List open pages
- **select_page** – `pageId`, optional `bringToFront`
- **navigate_page** – `type`: url | back | forward | reload; `url` when type=url; optional `timeout`, `ignoreCache`, `initScript`, `handleBeforeUnload`
- **new_page** – `url`; optional `background`, `timeout`
- **close_page** – `pageId` (cannot close last page)
- **wait_for** – `text` to appear; optional `timeout`

### Emulation (2)
- **emulate** – Optional: `viewport`, `userAgent`, `colorScheme`, `geolocation`, `networkConditions`, `cpuThrottlingRate` (set to null to clear)
- **resize_page** – `width`, `height`

### Performance (3)
- **performance_start_trace** – `reload`, `autoStop`; optional `filePath` for trace file
- **performance_stop_trace** – Optional `filePath`. Now includes **CrUX field data** (LCP with breakdown, INP, CLS) from real users alongside lab metrics. Disable with `--no-performance-crux`.
- **performance_analyze_insight** – `insightSetId`, `insightName` (from trace results)

### Network (2)
- **list_network_requests** – Optional: `pageSize`, `pageIdx`, `resourceTypes`, `includePreservedRequests`
  - **resourceTypes** (array): e.g. `['websocket']`, `['xhr','fetch']`, `['document']` — or omit for all. Values: document, stylesheet, image, media, font, script, texttrack, xhr, fetch, prefetch, eventsource, **websocket**, manifest, signedexchange, ping, cspviolationreport, preflight, fedcm, other
- **get_network_request** – Optional `reqid` (else uses DevTools selection); optional `requestFilePath`, `responseFilePath` to save bodies

### Debugging (5)
- **take_snapshot** – Optional `verbose`, `filePath`. Returns a11y tree with element `uid`s.
- **take_screenshot** – Optional `uid`, `fullPage`, `format`, `quality`, `filePath`
- **evaluate_script** – `function` (JS function as string), optional `args` (array of `{uid}`). Return value must be JSON-serializable.
- **list_console_messages** – Optional `pageSize`, `pageIdx`, `types`, `includePreservedMessages`
- **get_console_message** – `msgid`. Error objects show source-mapped stacks (1-based line/column) and Error.cause chains.

## Formatters (internal)

| Formatter | Used for | Notes |
|-----------|----------|--------|
| SnapshotFormatter | `take_snapshot` output | Text snapshot with `uid`s; `verbose` adds more a11y data |
| NetworkFormatter | `list_network_requests`, `get_network_request` | URL, status, headers, body (truncated or saved to file) |
| ConsoleFormatter | `list_console_messages`, `get_console_message` | Level, text, source-mapped stack, resolved args, Error.cause chains |
| IssueFormatter | DevTools issues in responses | Deprecations, violations, etc. |

## Telemetry

- **Default**: Usage statistics enabled (tool success, latency, environment).
- **Disable**: `--no-usage-statistics` or env `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` or `CI`.

## Common patterns

- **Scraping**: navigate → wait_for → take_snapshot → evaluate_script (or parse snapshot) → repeat for next page.
- **WebSocket inspection**: navigate → trigger WS → list_network_requests(resourceTypes: ['websocket']) → get_network_request(reqid).
- **Form + submit**: take_snapshot → fill or fill_form (by uid) → click submit button (by uid) → wait_for or take_snapshot.
