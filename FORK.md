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

### 4. Page-lifecycle hygiene for many short-lived agents

With dozens of agents sharing one browser, `new_page` accumulated tabs:

- **Failed navigations no longer orphan blank tabs.** Upstream's `new_page` creates the tab first, then calls `goto`; a failed `goto` (timeout, refused connection, blocked navigation) threw and left the tab parked at `about:blank`, and agents would retry — multiplying blank tabs. The fork wraps the navigation, and if it fails while the tab is still blank, closes that tab (best-effort; the last tab is never closed) and reports the failure gracefully instead of throwing.
- **`background` is honored for isolated contexts.** Upstream dropped the `background` flag on the `isolatedContext` path, so agent tabs always stole foreground focus. The fork passes `{background}` through both paths.
- **Opt-in tab reuse.** `new_page` accepts `reuseExisting` (default `false`): when set, it reuses an existing blank (`about:blank`) tab in the target context instead of opening another. Off by default because, in a shared isolated context, a blank tab may belong to another agent that just opened it and hasn't navigated yet.

These changes touch `src/McpContext.ts`, `src/tools/pages.ts`, and `src/tools/ToolDefinition.ts`. Tested via `tests/tools/pages.test.ts`.

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
- `src/McpContext.ts` (`newPage` reuse + background; `isBlankUrl` helper)
- `src/tools/pages.ts` (`new_page` failed-navigation cleanup + `reuseExisting`)
- `src/tools/ToolDefinition.ts` (`Context` interface: `getPageId`, `newPage` arg)

## Attribution

Each modified file carries a `Modifications Copyright 2026 Colin (@cejor6)` notice in addition to the original `Copyright Google LLC` header. New files are copyright Colin (@cejor6). See `NOTICE` for the consolidated list.

## Shared HTTP setup

For the per-page mutex to deliver actual parallelism across multiple Claude Code windows, the server has to be shared — one long-lived process that every session connects to over HTTP. The repo ships per-OS setup scripts in [`scripts/`](./scripts/README.md):

| OS              | Setup                               | Uninstall                               |
| --------------- | ----------------------------------- | --------------------------------------- |
| Windows         | `scripts\setup-shared-mcp.ps1`      | `scripts\uninstall-shared-mcp.ps1`      |
| macOS           | `scripts/setup-shared-mcp.macos.sh` | `scripts/uninstall-shared-mcp.macos.sh` |
| Linux (systemd) | `scripts/setup-shared-mcp.linux.sh` | `scripts/uninstall-shared-mcp.linux.sh` |

All variants register a per-user OS service (Task Scheduler / launchd / systemd user), bind to `127.0.0.1:9876` only, require a bearer token (stored 0600 / Windows ACL: user-only), and use a dedicated `--user-data-dir` so the shared profile never collides with the default stdio Chrome profile. The Claude Code user MCP config is rewritten atomically via the `claude mcp` CLI.

See [`scripts/README.md`](./scripts/README.md) for OS-specific file locations, common knobs (`PORT`, `FORK_PATH`, `FORCE`), and rollback flags.

## Issues and contributions

Open an issue at <https://github.com/cejor6/chrome-devtools-mcp/issues>. PRs welcome — `main` is protected; everything goes through a PR. Maintainer reviews and merges.

For upstream-relevant changes (bug fixes, broadly useful features), please consider opening a PR against [the upstream repo](https://github.com/ChromeDevTools/chrome-devtools-mcp) instead.
