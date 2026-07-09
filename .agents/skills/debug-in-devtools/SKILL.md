---
name: debug-in-devtools
description: Use this skill to open the Chrome DevTools window for a given page, allowing the user to manually inspect and debug the page.
---

# Instructions

1. If a page ID is not already selected or known, use the `list_pages` tool to find the correct page ID.
2. Use the `select_page` tool to select the target page as the context for future tool calls.
3. Run the `open_devtools` tool to open the DevTools window for the selected page.
4. Notify the user that the DevTools window has been successfully opened.
