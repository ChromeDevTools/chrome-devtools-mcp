# Fork tooling: shared HTTP MCP setup

These scripts wire up the fork as a **long-lived HTTP MCP service** shared by every Claude Code session on the machine. After setup:

- One Chrome instance, persistent across Claude Code restarts.
- Every Claude Code window connects to the same server over HTTP+bearer.
- The per-page mutex actually delivers parallelism across sessions (proven ~3× on the smoke tests under `test-output/`).

## Pick the script for your OS

| OS                  | Setup                       | Uninstall                       | Service backend                               |
| ------------------- | --------------------------- | ------------------------------- | --------------------------------------------- |
| **Windows**         | `setup-shared-mcp.ps1`      | `uninstall-shared-mcp.ps1`      | Task Scheduler (AtLogOn + restart-on-failure) |
| **macOS**           | `setup-shared-mcp.macos.sh` | `uninstall-shared-mcp.macos.sh` | launchd user agent (`~/Library/LaunchAgents`) |
| **Linux** (systemd) | `setup-shared-mcp.linux.sh` | `uninstall-shared-mcp.linux.sh` | systemd user service (`systemctl --user`)     |

All variants do the same thing:

1. Generate a 32-byte bearer token (mode 0600 / Windows ACL: user-only).
2. Pick a port (default `9876`), bind to `127.0.0.1` only.
3. Use a dedicated `--user-data-dir` so the shared server doesn't collide with the default stdio Chrome profile.
4. Register a per-user OS service that starts at logon and restarts on failure.
5. Wait for the HTTP endpoint to become reachable.
6. Atomically rewrite the Claude Code user MCP config via `claude mcp add --transport http --header "Authorization: Bearer …"`.

All variants are idempotent — safe to re-run to update settings or rotate the token (pass `Force` / `FORCE=1`).

## Prerequisites

- `node` and `npm` on PATH.
- The fork cloned and built: `npm run build` in the fork's directory.
- `claude` CLI on PATH.
- macOS / Linux: `openssl` and `curl` (almost always already there).

## Common knobs

| Variable                             | Default                                 | What it does                                                 |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| `PORT` (sh) / `-Port` (ps1)          | `9876`                                  | TCP port on `127.0.0.1`                                      |
| `FORK_PATH` (sh) / `-ForkPath` (ps1) | repo root resolved from script location | Path to the cloned fork                                      |
| `FORCE=1` (sh) / `-Force` (ps1)      | off                                     | Regenerate the bearer token instead of reusing the saved one |

## File locations

| Purpose                 | Windows                               | macOS                                                       | Linux                                                |
| ----------------------- | ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Token                   | `%APPDATA%\cdmcp\token`               | `~/Library/Application Support/cdmcp/token`                 | `~/.config/cdmcp/token`                              |
| Launcher / service unit | `%APPDATA%\cdmcp\launcher.ps1`        | `~/Library/LaunchAgents/dev.cejor6.chromedevtoolsmcp.plist` | `~/.config/systemd/user/chrome-devtools-mcp.service` |
| Chrome profile          | `%LOCALAPPDATA%\cdmcp\chrome-profile` | `~/Library/Application Support/cdmcp/chrome-profile`        | `~/.local/share/cdmcp/chrome-profile`                |
| Logs                    | `%LOCALAPPDATA%\cdmcp\logs\`          | `~/Library/Logs/cdmcp/`                                     | `~/.local/state/cdmcp/logs/`                         |

## Rolling back

Each uninstall script accepts `-RestoreStdio` (PowerShell) or `RESTORE_STDIO=1` (bash) to re-add the stdio variant of `chrome-devtools` to the Claude Code config after removing the HTTP version. Without that flag it just removes the entry — you'd add whatever you want with `claude mcp add` afterwards.

`-KeepTokenAndLogs` (PowerShell) / `KEEP_DATA=1` (bash) skips the prompt that offers to delete the token and log directories.

## Verification status

| OS      | Status                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows | ✅ Verified end-to-end on Windows 11 / PowerShell 5.1 / Node 22. Scheduled Task → powershell launcher → node, server reachable, `claude mcp get` reports Status: Connected.                                              |
| macOS   | ⚠️ Unverified — same logical fixes applied as Windows (URL position in `claude mcp add`, etc.), parse-checked with `bash -n`. launchd has no analog of the Windows wscript-orphan bug. Please file an issue if it fails. |
| Linux   | ⚠️ Unverified — same as macOS. systemd has no analog of the Windows wscript-orphan bug. Please file an issue if it fails.                                                                                                |

## Caveats

- All Claude Code windows on the machine will share **one Chrome profile**. Cookies, login sessions, and tabs are visible across sessions. That's the whole point — see [`../CLAUDE.md`](../CLAUDE.md) for the multi-session etiquette rules agents should follow.
- The browser process becomes long-lived. To bounce it: restart the OS service (`schtasks /Run`, `launchctl kickstart -k`, `systemctl --user restart`) or just kill the Chrome process — the service will restart it.
- Token rotation: re-run setup with `Force`/`FORCE=1`. Already-running Claude Code windows hold the old token and will need to be restarted.
- Linux non-systemd init systems (sysvinit, OpenRC, runit) are not supported by the script directly — adapt the systemd unit to your init manager.
