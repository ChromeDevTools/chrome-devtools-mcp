---
name: debug-in-devtools
description: Use this skill to open the Chrome DevTools window for a given page, interact with developer comment threads, reveal visual targets in DevTools, and resolve feedback.
---

# Instructions

1. If a page ID is not already selected or known, use the `list_pages` tool to find the correct page ID.
2. Use the `select_page` tool to select the target page as the context for future tool calls.
3. Run the `open_devtools` tool to open the DevTools window for the selected page.
4. Fetch active comment threads using the `get_devtools_comments` tool to read open developer comments, target elements (resolved snapshot `uid` or `backendNodeId`), network requests (resolved `reqid` or CDP `networkRequestId`), and editor location (`filePath` and `lineNumber`).
5. If visual context or DOM / network inspection is needed, use `reveal_devtools_target` specifying the target `panelName` (e.g. `elements`, `network`, `sources`, `console`) along with `uid` (snapshot element UID) / `backendNodeId`, or `reqid` (network request ID) / `networkRequestId`.
6. Inspect the comments, target elements, and code locations, diagnose the developer's feedback, and perform the necessary code changes in the workspace.
7. Once edits are applied, call `update_devtools_comment` with the `threadId` and an explanatory `replyText` to reply to the developer and mark the thread as resolved.
8. If waiting for further developer comments or reviews, inform the user that DevTools is active and you are awaiting new comments (which trigger MCP notifications or can be checked with `get_devtools_comments`).
