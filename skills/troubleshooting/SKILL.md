---
name: troubleshooting
description: Uses Chrome DevTools MCP and documentation to troubleshoot connection and target issues. Trigger this skill when list_pages, new_page, or navigate_page fail, or when the server initialization fails.
---

## Troubleshooting Wizard

You are acting as a troubleshooting wizard to help the user configure and fix their Chrome DevTools MCP server setup. When this skill is triggered (e.g., because `list_pages`, `new_page`, or `navigate_page` failed, or the server wouldn't start), follow this step-by-step diagnostic process:

### Step 1: Determine the Exact Error

Identify the exact error message from the failed tool call or the MCP initialization logs. Look for common errors such as:

- `Target closed`
- "Tool not found" (check if they are using `--slim` which only enables navigation and screenshot tools).
- `ProtocolError: Network.enable timed out` or `The socket connection was closed unexpectedly`
- `Error [ERR_MODULE_NOT_FOUND]: Cannot find module`
- Any sandboxing or host validation errors.

### Step 2: Read Known Issues

Read the contents of https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/troubleshooting.md to map the error to a known issue. Pay close attention to:

- Sandboxing restrictions (macOS Seatbelt, Linux containers).
- WSL requirements.
- `--autoConnect` handshakes, timeouts, and requirements (requires Chrome 144+).
- Conflicts between `--autoConnect`/`--browser-url` and extension debugging.

### Step 3: Formulate a Configuration

Based on the exact error and the user's environment (OS, MCP client), formulate the correct MCP configuration snippet. Check if they need to:

- Pass `--browser-url=http://127.0.0.1:9222` instead of `--autoConnect` (e.g. if they are in a sandboxed environment like Claude Desktop).
- Remove `--enableCategoryExtensions` if using `--autoConnect`.
- Enable remote debugging in Chrome (`chrome://inspect/#remote-debugging`) and accept the connection prompt.
- Add `--logFile <absolute_path_to_log_file>` to capture debug logs for analysis.
- Increase `startup_timeout_ms` (e.g. to 20000) if using Codex on Windows.

_If you are unsure of the user's configuration, ask the user to provide their current MCP server JSON configuration._

### Step 4: Run Diagnostic Commands

If the issue is still unclear, run diagnostic commands to test the server directly:

- `npx chrome-devtools-mcp@latest --help` (to verify the installation and Node.js environment)
- Ask the user to run `DEBUG=* npx chrome-devtools-mcp@latest --logFile=/tmp/cdm-test.log` to capture verbose logs if they are attempting to run it from an IDE or different environment.

### Step 5: Check GitHub for Existing Issues

If https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/troubleshooting.md does not cover the specific error, check if the `gh` (GitHub CLI) tool is available in the environment. If so, search the GitHub repository for similar issues:
`gh issue list --repo ChromeDevTools/chrome-devtools-mcp --search "<error snippet>" --state all`

Alternatively, you can recommend that the user checks https://github.com/ChromeDevTools/chrome-devtools-mcp/issues and https://github.com/ChromeDevTools/chrome-devtools-mcp/discussions for help.
