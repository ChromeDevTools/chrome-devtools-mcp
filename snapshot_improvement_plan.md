# Implementation Plan: Chrome DevTools CLI & MCP Optimizations

This plan implements optimizations for the `take_snapshot` tool to improve agent efficiency by reducing the volume of DOM data transmitted. It ensures full compatibility with both the Model Context Protocol (MCP) and the `chrome-devtools` CLI.

## Progress Overview

- [x] **Step 0: Save Plan to Project**
  - [x] Save this plan to `/Users/hablich/src/internal/chrome-devtools-mcp/snapshot_improvement_plan.md`
- [x] **Step 0: Save Plan to Project**
- [x] **PR 1: Native Semantic Filtering** (`feat/semantic-filtering`)
  - [x] Create branch and apply filtering changes
  - [x] Include `post-build.ts` fix (on `main`)
  - [x] Verify tests and CLI
  - [x] Commit
- [x] **PR 2: Built-in "Interactive Only" Mode** (`feat/interactive-mode`)
  - [x] Create branch and apply interactive mode changes
  - [x] Include `post-build.ts` fix
  - [x] Verify tests and CLI
  - [x] Commit
- [x] **PR 3: Session-Based Snapshot Diffs** (`feat/snapshot-diffs`)
  - [x] Create branch and apply diffing + UID stability changes
  - [x] Include `post-build.ts` fix
  - [x] Verify tests and CLI
  - [x] Commit
- [x] **Verification**
  - [x] Check if each branch works independently from each other.

---

## PR 1: Native Semantic Filtering

**Objective**: Enable agents to request only specific types of elements from the accessibility tree.

- **Flags**: `role`, `name`, `text`
- **Tasks**:
  - [ ] Update `SnapshotParams` in `src/tools/ToolDefinition.ts`.
  - [ ] Update `take_snapshot` tool schema in `src/tools/snapshot.ts`.
  - [ ] Implement `filterTree` in `McpContext.ts` to prune nodes that do not match and do not have matching descendants.
  - [ ] Update `createTextSnapshot` to use `filterTree`.
  - [ ] Add tests to `tests/McpContext.test.ts` verifying `role`, `name`, and `text` filters.

## PR 2: Built-in "Interactive Only" Mode

**Objective**: Strip non-actionable content from snapshots.

- **Flag**: `interactive`
- **Tasks**:
  - [ ] Define "interactive" roles: `button`, `link`, `menuitem`, `checkbox`, `radio`, `textbox`, `searchbox`, `combobox`.
  - [ ] Implement `isInteractive` check in `McpContext.ts`.
  - [ ] Use `DOMDebugger.getEventListeners` to include nodes with event listeners.
  - [ ] Update `createTextSnapshot` to use this logic when `interactive: true`.
  - [ ] Add tests to `tests/tools/snapshot.test.ts` with complex HTML to verify pruning of static text.

## PR 3: Session-Based Snapshot Diffs

**Objective**: Send only changes since the last observation.

- **Flag**: `diff`
- **Tasks**:
  - [ ] Update `McpPage` to store `lastSnapshot` and reset on `framenavigated` / `load`.
  - [ ] Implement semantic diffing by `uid`.
  - [ ] Update `SnapshotFormatter` to render diffs with `[+]`, `[-]`, `[*]`.
  - [ ] Add tests to `tests/McpContext.test.ts` for multiple snapshot calls, ensuring only deltas are returned and navigation resets the cache.

---

## Verification & Testing Strategy

- **Infrastructure**: Use `withMcpContext` in existing test files.
- **MCP Verification**: Run the server and call `take_snapshot` with new parameters.
- **CLI Verification**:
  - Run `npm run cli:generate` after each PR.
  - Run `chrome-devtools take_snapshot --help` to check for new flags.
  - Execute commands like `chrome-devtools take_snapshot --role button` and verify output.
- **Daemon Verification**: Ensure that `diff` mode works correctly when calling the CLI multiple times (state should be preserved in the running daemon).
