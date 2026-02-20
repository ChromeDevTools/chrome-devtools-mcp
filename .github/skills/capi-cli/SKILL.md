---
name: capi-cli
description: Guide for using the capi (vscode-api) CLI to interact with running VS Code sessions programmatically. Use when asked to discover VS Code sessions, execute VS Code commands, run JavaScript in the extension host, show notification messages, list available APIs, batch-execute commands, or automate VS Code workflows from the terminal. Covers commands like sessions, apis, command, exec, exec-with-action, message, and batch.
---

# Capi CLI

The `capi` CLI (alias `vscode-api`) discovers running VS Code instances and interacts with them over HTTP. It requires the VS Code API Exposure extension to be active in the target VS Code window.

## Session Discovery and Targeting

The CLI scans ports 3637-3641 to find active VS Code sessions.

### Discover sessions

```bash
capi sessions
```

### Target a specific session

Use either `--session` (by ID prefix) or `--workspace` (by path) on any command:

```bash
capi apis --session abc123
capi exec "vscode.window.activeTextEditor?.document.fileName" --workspace /my/project
```

### Global options

| Option | Description |
|--------|-------------|
| `-s, --session <id>` | Target session by ID prefix |
| `-w, --workspace <path>` | Target session by workspace path |
| `-j, --json` | Force raw JSON output |
| `-v, --verbose` | Enable verbose logging |

## Core Workflows

### 1. Execute a VS Code command

Run any registered VS Code command by its identifier:

```bash
capi command workbench.action.files.save
capi cmd editor.action.selectAll
capi command workbench.action.openSettings --json
```

### 2. Execute JavaScript in extension host

Run arbitrary JS code in the VS Code extension host context:

```bash
capi exec "vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath)"
capi exec "vscode.window.activeTextEditor?.document.getText()" --json
```

### 3. Execute with chained action

Run code and process the result with a second script:

```bash
capi exec-with-action "vscode.workspace.workspaceFolders" "return result.map(f => f.name)"
```

### 4. Show a notification

Display a toast message in VS Code:

```bash
capi message "Build complete!" --type info
capi msg "Deployment failed" --type error
```

### 5. List available APIs

Retrieve all exposed VS Code APIs and commands:

```bash
capi apis
capi apis --json
```

### 6. Batch execution

Execute commands from a file (one per line):

```bash
capi batch commands.txt
```

File format:

```text
# Comments start with #
exec vscode.window.activeTextEditor?.document.fileName
workbench.action.files.save
editor.action.formatDocument
```

Lines starting with `exec ` run as JavaScript; all other non-empty, non-comment lines run as VS Code commands.

## Common Patterns

### Get active file info

```bash
capi exec "(() => { const e = vscode.window.activeTextEditor; return e ? { file: e.document.fileName, lang: e.document.languageId, lines: e.document.lineCount } : null; })()" --json
```

### Open a file

```bash
capi command vscode.open /path/to/file.ts
```

### Toggle terminal

```bash
capi command workbench.action.terminal.toggleTerminal
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No sessions found | Ensure VS Code API Exposure extension is installed and running |
| Wrong session targeted | Use `capi sessions` to list all, then target with `--session` or `--workspace` |
| Command not found | Use `capi apis` to verify available commands |
| Exec returns undefined | Wrap code in an IIFE that returns a value |

## Reference

See [command-reference.md](./references/command-reference.md) for the full specification of every command, argument, and option.
