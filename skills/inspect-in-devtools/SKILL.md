---
name: inspect-in-devtools
description: Use this skill to connect to the Chrome DevTools UI for interactive debugging, UI/UX review, Q&A, showing elements/network requests/panels to the user, inspecting the user's current DevTools selection, and addressing or polling for DevTools UI comment threads.
---

# Debug, Review, and Q&A in DevTools

Use this skill to:

1. **Show a target to the user**: Open DevTools and reveal a panel, a DOM element, or a network request.
2. **Inspect the user's selection**: Read the element or network request that the user selected in DevTools.
3. **Address DevTools comments**: Fetch comment threads, answer questions or apply fixes, and resolve the threads.

## Prerequisites

- **Chrome version**: Chrome M159 or later.
- **Required flag**: `--devtools-comments` in the MCP server config. Without it, `open_devtools`, `reveal_in_devtools`, `get_devtools_comments`, and `resolve_devtools_comment` are not available.
- **Headed browser**: Chrome must not run in `--headless` mode.
- **Page targeting**: All tools require a `pageId` from `list_pages` or `new_page`.

## Workflows

### 1. Open DevTools

Call `open_devtools` with `pageId`. Do this before you call `reveal_in_devtools`, `get_devtools_comments`, or `resolve_devtools_comment`.

### 2. Reveal a panel, element, or network request

Call `reveal_in_devtools` with `pageId` and these optional parameters:

- `panelName`: `"elements"`, `"network"`, `"sources"`, or `"console"`. Pass it alone to switch panels.
- `uid`: Element `uid` from `take_snapshot`. Reveals the element in the Elements panel.
- `reqid`: Request `reqid` from `list_network_requests`. Reveals the request in the Network panel.

`uid` and `reqid` are mutually exclusive.

### 3. Inspect the user's selection

- **DOM element**: Call `take_snapshot`. The snapshot marks the element selected in the Elements panel. Pass its `uid` to `get_css_styles`, `take_screenshot`, or `evaluate_script`.
- **Network request**: Call `get_network_request` and omit `reqid`. It returns the request selected in the Network panel.

### 4. Handle comment threads

Select the mode from the user's request.

#### Mode A: One-shot (comments already exist)

Use this mode when the user says the comments are already in DevTools, or asks you not to poll.

1. Call `get_devtools_comments` once.
2. Process and resolve each returned thread.
3. Summarize your changes and answers in chat, then end your turn. Do **not** poll.

#### Mode B: Watch (wait for user feedback)

Use this mode when the user asks you to wait while they debug, review, or add comments.

1. Call `get_devtools_comments` immediately.
2. While the result is `"No open DevTools comments found."`, wait 10 seconds, then call it again. Call it immediately if a `"DevTools comment threads updated"` notification arrives.
3. Stop after 12 consecutive empty polls (about 2 minutes) or when the user asks you to stop.
4. When threads appear, process and resolve them. Then reset the empty-poll counter and continue polling.

Rules for polling:

- **Use a background sub-agent** when sub-agent tools are available, so the main thread stays responsive. The sub-agent returns the threads to the main agent, or resolves them itself if it has workspace and MCP tools.
- **Poll inline** only when sub-agent tools are unavailable. Do not end your turn early.
- **Never call `get_devtools_comments` back-to-back** without the 10-second delay.

#### Process and resolve a thread

For each `### Thread: <id>`:

1. **Inspect the anchored target**:
   - `Related element uid`: Use `get_css_styles`, `take_snapshot`, or `take_screenshot` with the `uid`.
   - `Related network reqid`: Use `get_network_request` with the `reqid`.
   - Optionally call `reveal_in_devtools` to show the target to the user.
2. **Address the comment**:
   - For a code or styling request, apply the fix in the workspace. Reload and verify the page if needed.
   - For a question or root-cause investigation, collect diagnostic data. Do not make unnecessary code edits.
3. **Resolve**: Call `resolve_devtools_comment` with `pageId`, `threadId`, and `replyText`:
   - For a question or root cause, write a detailed answer.
   - For a straightforward fix, write 1–2 sentences that state the change and the file.
