---
name: inspect-in-devtools
description: Use this skill to connect to the Chrome DevTools UI for interactive debugging, UI/UX review, Q&A, showing elements/network requests/panels to the user, inspecting the user's current DevTools selection, and addressing or watching for DevTools UI comment threads.
---

# Debug, Review, and Q&A in DevTools

Use this skill to:

1. **Show a target to the user**: Open DevTools and reveal a panel, a DOM element, or a network request.
2. **Inspect the user's selection**: Read the element or network request that the user selected in DevTools.
3. **Address DevTools comments**: Watch for comment threads in the background, answer questions or apply fixes, and resolve the threads.

## Prerequisites

- **Chrome version**: Chrome M159 or later.
- **Required flag**: `--devtools-comments` in the MCP server config. Without it, `open_devtools`, `reveal_in_devtools`, `get_devtools_comments`, and `resolve_devtools_comment` are not available.
- **Headed browser**: Chrome must not run in `--headless` mode.
- **Page targeting**: All tools require a `pageId` from `list_pages` or `new_page`.

## Unsupported Chrome

This skill does not work on Chrome versions earlier than M159. If a tool returns `DevTools comments are not supported by the connected browser`:

1. Stop the workflow. Do not poll, retry, or call other DevTools comment tools.
2. Tell the user that this feature requires Chrome 159 or later, and that they can update Chrome or restart the MCP server with a newer `--channel` (for example, `--channel=canary`).
3. Do not tell the user that the page is ready for review in DevTools.
4. If a background watcher receives this error, it must stop immediately and report it back to the main agent so the main agent informs the user.

## Default Behavior: Background Comment Watching

Whenever you call `open_devtools` or `reveal_in_devtools` to show something to the user, assume they may leave DevTools comments next:

- **If sub-agent tools are available**: Automatically start (or verify) a background comment watcher sub-agent for `pageId` before ending your turn, unless one is already active for that `pageId` or the user explicitly opted out (for example, "check once" or "don't poll"). Tell the user in chat that you are watching for DevTools comments in the background, then end your turn promptly so chat stays responsive.
- **After resolving comments**: Message or resume the existing watcher for `pageId` rather than spawning a duplicate, unless the user says they are done.
- **If sub-agent tools are unavailable**: Do **not** block the main turn by polling inline after `open_devtools` or `reveal_in_devtools`. Only poll inline when the user explicitly asks you to wait for comments.

## Workflows

### 1. Open DevTools

Call `open_devtools` with `pageId`. Do this before calling `reveal_in_devtools`, `get_devtools_comments`, or `resolve_devtools_comment`. Then ensure a background comment watcher is running for `pageId` (see Default Behavior above).

### 2. Reveal a panel, element, or network request

Call `reveal_in_devtools` with `pageId` and these optional parameters:

- `panelName`: `"elements"`, `"network"`, `"sources"`, or `"console"`. Pass it alone to switch panels.
- `uid`: Element `uid` from `take_snapshot`. Reveals the element in the Elements panel. If the element may be below the fold, also scroll it into view on the page (for example with `evaluate_script`) so the user can see it in the viewport as well as the Elements tree.
- `reqid`: Request `reqid` from `list_network_requests`. Reveals the request in the Network panel.

`uid` and `reqid` are mutually exclusive. After revealing a target, ensure a background comment watcher is running for `pageId` (see Default Behavior above).

### 3. Inspect the user's selection

- **DOM element**: Call `take_snapshot` with `verbose: true` when reading the element selected in the Elements panel, or whenever a non-accessibility node (`<div>`, wrapper, or decorative `<img>`) is omitted from a compact snapshot. Pass its `uid` to `get_css_styles`, `take_screenshot`, or `evaluate_script`.
- **Network request**: Call `get_network_request` and omit `reqid`. It returns the request selected in the Network panel.

### 4. Handle comment threads

#### Mode A: Watch in the background (default)

Use this mode automatically after `open_devtools` or `reveal_in_devtools`, and whenever the user asks to check or wait for comments, unless they explicitly opt out.

Watcher lifecycle and rules:

1. **Prevent duplicates**: Keep at most one active watcher sub-agent per `pageId`. Never spawn a second watcher for the same `pageId`; after resolving a batch of comments in the main thread, message or resume the existing watcher to keep listening. Because `get_devtools_comments` returns each thread only once, do not call `get_devtools_comments` from the main agent while a watcher is active for `pageId`.
2. **Require MCP tool access**: The background watcher sub-agent must have access to the `chrome-devtools` MCP tools (do not use a read-only or tool-restricted sub-agent that cannot call `get_devtools_comments`). If your harness lets you pick a lighter or faster model for sub-agents, prefer it since the watcher only polls.
3. **Split responsibilities**: The watcher **only** calls `get_devtools_comments(pageId, timeout: 10000)` and passes the full tool output unchanged (thread id, comment, `uid`, `reqid`), or any unsupported-Chrome error, back to the main agent so no threads are lost or rewritten. The main agent, which has full conversation and workspace context, inspects targets, edits files, verifies changes, resolves threads, and resumes the watcher.
4. **Polling cadence and timeout notice**:
   - Keep `timeout: 10000` (the 10s default) rather than a longer wait so interactive browser tool calls from the main agent do not stall behind an active poll in MCP clients that serialize requests per server. Never pass `timeout: 0` while polling (it returns immediately without waiting).
   - While the result has no threads (`"Waited <n>ms for new DevTools comments."` or `"No open DevTools comments found."`), call `get_devtools_comments` again.
   - Stop after 12 consecutive empty 10s polls (about 2 minutes) or when the user asks you to stop.
   - **No silent expiry**: When the watcher stops due to inactivity, it must notify the main agent so you tell the user in chat that background watching paused and they can ask you to check again if they add more comments.
5. **Propagate unsupported-Chrome errors**: If the watcher receives `DevTools comments are not supported by the connected browser`, it must stop immediately and report the error back to the main agent.
6. **Inline polling fallback (opt-in only)**: Only when sub-agent tools are unavailable **and** the user explicitly asks you to wait for comments, poll `get_devtools_comments(pageId, timeout: 10000)` inline (do not end your turn early) up to 12 consecutive empty polls, and tell the user if watching expires.

#### Mode B: One-shot (explicit opt-out)

Use this mode only when the user explicitly asks not to keep watching (for example, "check once" or "don't poll").

1. Call `get_devtools_comments` once with `timeout: 0`.
2. Process and resolve each returned thread.
3. Post a brief summary in chat and end your turn without polling.

#### Process and resolve a thread

For each `### Thread: <id>`:

1. **Inspect the anchored target**:
   - `Related element uid`: Use `get_css_styles`, `take_snapshot` (with `verbose: true` if needed), or `take_screenshot` with the `uid`.
   - `Related network reqid`: Use `get_network_request` with the `reqid`.
   - Optionally call `reveal_in_devtools` to bring the user's eye to the target.
2. **Address the comment**:
   - For a code or styling request, apply the fix in the workspace and verify the page. Edits the user makes directly in DevTools (for example, CSS changes in the Styles pane) arrive as comment threads too; apply the same change to the workspace source files. Inspect the anchored element before any full reload (reloading invalidates `backendNodeId` / `uid`). DevTools comments survive page reloads in the Comments drawer (only closing DevTools clears them), while HMR/live updates preserve anchored DOM nodes cleanly without marking them `(removed)`. Prefer HMR when available; reload only when needed.
   - For a question or root-cause investigation, collect diagnostic data without making unnecessary code edits.
   - **Ambiguous comments**: `resolve_devtools_comment` replies and resolves in one action, and `get_devtools_comments` will not return the same thread again. If a comment is genuinely ambiguous and needs clarification, leave the thread unresolved, ask the user in chat, keep the `threadId`, and resolve the thread after the user answers.
3. **Resolve and summarize**:
   - Call `resolve_devtools_comment` with `pageId`, `threadId`, and a concise `replyText`: 1-2 sentences stating the change and file for fixes, or a direct root-cause answer for questions.
   - In chat, post a brief non-duplicative summary (mentioning the resolved thread and files changed) and confirm that you are continuing to watch for DevTools comments in the background.
