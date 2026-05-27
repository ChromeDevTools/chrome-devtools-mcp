# Fork notes

This is a fork of [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp), maintained by [@cejor6](https://github.com/cejor6).

The goal is to make `chrome-devtools-mcp` robust enough for **multiple agents to drive different pages in the same Chrome instance in parallel**, including across separate client processes.

## What this fork adds

### 1. Per-page mutex (`MutexRegistry`)

Upstream uses a single global mutex that serializes every tool call. Two agents working on two different pages step on each other (one waits while the other runs).

This fork replaces the single mutex with a `MutexRegistry` that:

- Hands out a separate mutex per `pageId` for page-scoped tools (`evaluate_script`, `click`, `take_snapshot`, etc.).
- Uses a global mutex for topology-changing tools (`new_page`, `close_page`, `select_page`, `list_pages`).
- Drains all per-page mutexes when a topology tool runs, so page topology never mutates while page work is in flight.

**Effect:** with `--experimentalPageIdRouting` enabled, two page-scoped tool calls on different pages truly run in parallel. Tested via `tests/Mutex.test.ts`.

**Backward compatibility:** when `--experimentalPageIdRouting` is off, behavior matches upstream exactly (single-flight via the global mutex).

### 2. Streamable HTTP transport

Upstream is stdio-only. Stdio only allows one client process at a time, so independent Claude Code windows / external clients can't share one browser.

This fork adds an HTTP transport (Streamable HTTP per the MCP spec) running alongside stdio:

```
chrome-devtools-mcp --http-port 9876 --http-token "$MCP_TOKEN"
```

Flags:

- `--http-port <N>`: enable HTTP transport on this port. Stdio remains active.
- `--http-host <addr>`: bind address (default `127.0.0.1`). Non-loopback requires `--http-token`.
- `--http-token <token>`: bearer token required in `Authorization: Bearer <token>`.

Each HTTP session gets its own `McpServer` instance but shares the same Chrome browser via `SharedState` (extracted in `src/index.ts`).

### 3. `SharedState` factory

`createSharedState()` lazily launches/connects Chrome and owns the `MutexRegistry`. Multiple servers (stdio + N HTTP sessions) call into the same state, so the browser is launched once and all sessions cooperate via the same mutex registry.

## Keeping in sync with upstream

```sh
git fetch upstream
git checkout main
git merge upstream/main
# resolve conflicts (typically minimal; modified files are clearly marked)
git push origin main
```

The modifications are concentrated in a handful of files:

- `src/Mutex.ts` (additions only)
- `src/ToolHandler.ts` (constructor + handle() locking strategy)
- `src/index.ts` (refactor to expose SharedState)
- `src/bin/chrome-devtools-mcp-main.ts` (optionally start HTTP transport)
- `src/bin/chrome-devtools-mcp-cli-options.ts` (http-\* flags + validation)
- `src/third_party/index.ts` (re-export `StreamableHTTPServerTransport`)
- `src/HttpTransport.ts` (new file — entirely fork-owned)

## Attribution

Each modified file carries a `Modifications Copyright 2026 Colin (@cejor6)` notice in addition to the original `Copyright Google LLC` header. New files are copyright Colin (@cejor6). See `NOTICE` for the consolidated list.

## Issues and contributions

Open an issue at <https://github.com/cejor6/chrome-devtools-mcp/issues>. PRs welcome — `main` is protected; everything goes through a PR. Maintainer reviews and merges.

For upstream-relevant changes (bug fixes, broadly useful features), please consider opening a PR against [the upstream repo](https://github.com/ChromeDevTools/chrome-devtools-mcp) instead.
