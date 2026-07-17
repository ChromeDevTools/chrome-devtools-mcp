## Security policy

The Chrome DevTools MCP project takes security very seriously. Please use [Chromium’s process to report security issues](https://www.chromium.org/Home/chromium-security/reporting-security-bugs/).

### Scope

In general, it is the expectation that the AI agent or client using this MCP server validates any input (including tool calls and parameters) before sending it. The server provides powerful capabilities for browser automation and inspection, and it is the responsibility of the calling agent to ensure these are used safely and as intended.

Several tools in this project have the ability to perform actions such as writing files to disk (e.g., via browser downloads or screenshots) or dynamically loading Chrome extensions. These are intentional, documented features and are not vulnerabilities.

The server returns web content to the client as text (Markdown-like) or
structured data (`--experimentalStructuredContent`). The web content is returned
as-is to facilitate debugging and we do not consider changes in the output
text/Markdown structure based on the web content to be vulnerabilities. If
structure is important for your use case, use structured output
(`--experimentalStructuredContent`). Prefer using this server with trusted web
content or make sure your client takes precautions against prompt injections.

We appreciate feedback and suggestions from developers on how this tool can make it easier for them to build a more secure user experience, but will treat these exclusively as feature requests, and not vulnerabilities in chrome-devtools-mcp itself.

### MCP roots

`chrome-devtools-mcp` supports [MCP roots](https://modelcontextprotocol.io/specification/2025-06-18/client/roots). If the client specifies them, the MCP server will check the roots when accessing files.
Note that the MCP server always retains access to the OS-provided tmp directory. We treat security issues in the MCP roots implementation as low-severity issues because it is an optional configuration. To have full
filesystem sandboxing, we recommend using OS sandbox mechanisms.

### Network guardrails

Optional `--allowed-url-pattern` and `--blocked-url-pattern` arguments configure the browser to reject access to the identified URLs. Note that this is not a complete network sandbox and it only applies to Chrome DevTools targets while `chrome-devtools-mcp` is attached to them.
To have a full network sandbox, we recommend using a separate OS/VM sandbox mechanism.
