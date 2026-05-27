# Security policy

This is a fork of [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp). The security posture follows upstream's, with one addition: this repo has **private vulnerability reporting enabled on GitHub**.

## Reporting a vulnerability

- **For issues specific to this fork** (e.g., the HTTP transport's bearer auth, the per-page mutex behavior): use GitHub's private vulnerability reporting on this repo — <https://github.com/cejor6/chrome-devtools-mcp/security/advisories/new>.
- **For issues affecting upstream `chrome-devtools-mcp`**: please report through [Chromium's security bug process](https://www.chromium.org/Home/chromium-security/reporting-security-bugs/) so the broader user base benefits from the fix.

## Scope

In general, it is the expectation that the AI agent or client using this MCP server validates any input (including tool calls and parameters) before sending it. The server provides powerful capabilities for browser automation and inspection, and it is the responsibility of the calling agent to ensure these are used safely and as intended.

Several tools have the ability to perform actions such as writing files to disk (e.g., via browser downloads or screenshots) or dynamically loading Chrome extensions. These are intentional, documented features and are not vulnerabilities.

## HTTP transport specific

The HTTP transport added in this fork (see [FORK.md](./FORK.md)) binds to `127.0.0.1` by default and requires a bearer token (`--http-token`) when binding to a non-loopback address. Treat the token as a credential — anyone with it can drive your browser.

We will treat the following as in-scope vulnerabilities for this fork:

- Auth bypass on the HTTP transport.
- Inadvertent exposure of the HTTP transport on non-loopback interfaces without a token.
- Per-page mutex correctness issues that allow a tool call to operate on the wrong page.
