---
name: debug-in-devtools
description: Use this skill to show elements, network requests, or panels to the user in the Chrome DevTools UI, let the user interactively debug a page in DevTools, and let the user leave feedback for the agent via DevTools UI comment threads.
---

# Purpose

Use this skill whenever you need to:

1. **Show things to the user in the DevTools UI**: Open the Chrome DevTools window (`open_devtools`) and visually navigate to or highlight specific DOM elements (`uid`), network requests (`reqid`), or panels (`elements`, `network`, `sources`, `console`) using `reveal_in_devtools`.
2. **Let the user debug in DevTools**: Open the DevTools UI for a target page so the user can inspect and debug the live page directly.
3. **Receive and resolve user feedback via the DevTools UI**: Let the user leave comment threads anchored to DOM nodes, network requests, or source lines inside DevTools, fetch them with `get_devtools_comments`, apply the requested fixes in the workspace, and resolve them with `resolve_devtools_comment`.

# Workflow Instructions

## 1. Select the Page and Open DevTools

1. If the target `pageId` is not already known, call `list_pages` to identify the target page (and call `select_page` if needed).
2. Call `open_devtools` for the target page to open the Chrome DevTools window.

## 2. Show Targets to the User in DevTools UI

When you want to show a specific element, network request, or panel to the user in DevTools:

1. Obtain the target identifier first if needed:
   - For a DOM element: call `take_snapshot` to get the element's `uid`.
   - For a network request: call `list_network_requests` to get the request's `reqid`.
2. Call `reveal_in_devtools` with:
   - `panelName`: `"elements"`, `"network"`, `"sources"`, or `"console"`.
   - `uid` (for a DOM element) or `reqid` (for a network request). Note that `uid` and `reqid` are mutually exclusive.

## 3. Strict Polling Mechanism for DevTools Feedback

When letting the user debug in DevTools or waiting for the user to leave feedback via DevTools UI, you **must** follow this strict polling loop:

> **CRITICAL RULES**:
> - **Do NOT end your turn immediately** after opening DevTools or resolving a comment when waiting for user feedback in DevTools.
> - **Do NOT call `get_devtools_comments` back-to-back without a delay.** Always pause between polls so you do not flood the MCP server or exhaust tool call limits.

1. **Initial check**: Call `get_devtools_comments` immediately to check for any existing unresolved comment threads (`resolved: false`).
2. **Wait-then-poll loop**: While no unresolved comment threads are returned:
   - Wait **10 seconds** before the next poll (e.g. run `sleep 10` via your shell/command tool, or use a timer tool if available).
   - Call `get_devtools_comments` to check for new or updated comment threads.
   - If an MCP notification (`"DevTools comment threads updated"`) arrives at any point, immediately call `get_devtools_comments`.
   - Repeat the `sleep 10` -> `get_devtools_comments` cycle for up to **12 consecutive empty polls (~2 minutes)**. If no comments arrive after 12 polls, pause polling and ask the user in chat if they are still debugging or ready to continue.
3. **Process and resolve unresolved threads**: As soon as `get_devtools_comments` returns one or more unresolved threads (`resolved: false`):
   - Read each thread's comments and inspect its anchored context:
     - DOM element (`uid`)
     - Network request (`reqid`)
     - Editor source location (`filePath` and `lineNumber`)
   - If visual alignment or deeper inspection is helpful, call `reveal_in_devtools` with the thread's `panelName` and `uid` or `reqid`.
   - Diagnose the user's feedback and perform the necessary code changes in the workspace.
   - Call `resolve_devtools_comment` with the `threadId` and a clear, concise `replyText` explaining how the feedback was addressed.
4. **Resume polling after resolution**: After resolving all current comment threads, **re-enter the wait-then-poll loop** (`sleep 10` -> `get_devtools_comments`) to pick up any follow-up comments from the user in DevTools.
