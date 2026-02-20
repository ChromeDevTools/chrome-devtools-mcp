# Capi CLI Command Reference

Full specification of every `capi` command, its arguments, and options.

## Table of Contents

- [Global Options](#global-options)
- [sessions](#sessions)
- [apis](#apis)
- [command](#command)
- [exec](#exec)
- [exec-with-action](#exec-with-action)
- [message](#message)
- [batch](#batch)

## Global Options

Apply to any command:

| Option | Description |
|--------|-------------|
| `-s, --session <id>` | Target a specific VS Code session by its unique Session ID |
| `-w, --workspace <path>` | Target a VS Code session that has a specific workspace path open |
| `-j, --json` | Force raw JSON output for programmatic parsing |
| `-v, --verbose` | Enable verbose logging |

## sessions

Discover running VS Code instances with the extension active.

- **Alias:** `ls`
- **Syntax:** `capi sessions`
- **Arguments:** None
- **Output:** Session ID, Port, PID, Workspace URI, and capability count for each session
- **Notes:** Scans ports 3637-3641 by default

## apis

List all available VS Code APIs and registered commands for the targeted session.

- **Syntax:** `capi apis [options]`
- **Arguments:** None
- **Output:**
  - Default: Human-readable list grouped by category (WINDOW, EDITOR, COMMAND, etc.)
  - With `--json`: Full JSON array of API definitions

## command

Execute a VS Code command by its identifier.

- **Alias:** `cmd`
- **Syntax:** `capi command <commandId> [args...]`
- **Arguments:**
  - `<commandId>` (required): Command identifier (e.g., `workbench.action.files.save`)
  - `[args...]` (optional): Arguments to pass to the command
- **Output:** JSON result returned by the command

### Examples

```bash
capi command workbench.action.files.save
capi cmd editor.action.selectAll
capi command vscode.open /path/to/file.ts
capi command workbench.action.openSettings --json
```

## exec

Execute arbitrary JavaScript in the VS Code extension host context.

- **Syntax:** `capi exec [code...]`
- **Arguments:**
  - `[code...]` (required): JavaScript code to run (multiple args joined by spaces)
- **Output:**
  - Default: Raw return value or "No return value"
  - With `--json`: Full result object in JSON

### Examples

```bash
capi exec "vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath)"
capi exec "vscode.window.activeTextEditor?.document.getText()" --json
capi exec "vscode.env.appName"
```

### Tips

- The code runs with access to the `vscode` namespace
- Wrap complex expressions in an IIFE to return values:
  `capi exec "(() => { const e = vscode.window.activeTextEditor; return e?.document.fileName; })()"`
- Use `--json` for structured output when parsing results

## exec-with-action

Execute code, then run a second script that receives the first result.

- **Syntax:** `capi exec-with-action <code> <onResult>`
- **Arguments:**
  - `<code>` (required): Initial JavaScript code to execute
  - `<onResult>` (required): JavaScript function body that processes the result (receives `result` variable)
- **Output:** Both `Result` (from first script) and `Action Result` (from second script)

### Examples

```bash
capi exec-with-action "vscode.workspace.workspaceFolders" "return result.map(f => f.name)"
capi exec-with-action "vscode.window.activeTextEditor?.document.getText()" "return result.length"
```

## message

Display a notification toast message inside VS Code.

- **Alias:** `msg`
- **Syntax:** `capi message <text> [options]`
- **Arguments:**
  - `<text>` (required): Message text content
- **Options:**
  - `-t, --type <type>`: Severity level - `info`, `warning`, or `error` (default: `info`)
- **Output:** Confirmation "Message sent successfully!"

### Examples

```bash
capi message "Build complete!"
capi msg "Deployment failed" --type error
capi message "Check config" --type warning
```

## batch

Execute commands from a file, line by line.

- **Syntax:** `capi batch <file>`
- **Arguments:**
  - `<file>` (required): Path to the batch file
- **File format:**
  - Lines starting with `#` are comments (ignored)
  - Lines starting with `exec ` run as JavaScript via `executeJavaScript`
  - All other non-empty lines run as VS Code commands (split by spaces for arguments)

### Example batch file

```text
# Setup workspace
workbench.action.files.save
editor.action.formatDocument
exec vscode.window.activeTextEditor?.document.fileName
# Open terminal
workbench.action.terminal.toggleTerminal
```
