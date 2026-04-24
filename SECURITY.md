## Security policy

The Chrome DevTools MCP project takes security very seriously. Please use [Chromium’s process to report security issues](https://www.chromium.org/Home/chromium-security/reporting-security-bugs/).

### Scope

In general, it is the expectation that the AI agent or client using this MCP server validates any input (including tool calls and parameters) before sending it. The server provides powerful capabilities for browser automation and inspection, and it is the responsibility of the calling agent to ensure these are used safely and as intended.

Several tools in this project have the ability to perform actions such as writing files to disk (e.g., via browser downloads or screenshots) or dynamically loading Chrome extensions. These are intentional, documented features and are not vulnerabilities.

We appreciate feedback and suggestions from developers on how this tool can make it easier for them to build a more secure user experience, but will treat these exclusively as feature requests, and not vulnerabilities in chrome-devtools-mcp itself.
