---
name: chrome-devtools-remote
description: Run chrome-devtools-mcp as an always-on HTTP server on a remote machine (Mac mini, CI runner, tailnet host) and drive its browser from any AI agent on the same network. Covers server setup with --port and --tailscale, agent configuration for Claude Code / OpenCode / OpenClaw, and the chrome-devtools CLI --remote flag for scripting.
---

# chrome-devtools-remote

Drive a `chrome-devtools-mcp` server running on another machine — no local Chrome needed.

## Server setup (on the remote host, once)

### Start over HTTP

```bash
# Stdio is the default. Add --port to expose a Streamable HTTP endpoint instead:
chrome-devtools-mcp --port 3100
# MCP endpoint is now at http://<host>:3100/mcp
# Health probe:           http://<host>:3100/health
```

### Expose over Tailscale (recommended for multi-agent access)

```bash
npm install -g @vibebrowser/chrome-devtools-mcp   # or: npx chrome-devtools-mcp --port 3100
chrome-devtools-mcp install --port 3100 --tailscale
# Configures Tailscale Serve so the endpoint is at:
#   https://<machine>.tailnet.ts.net/mcp
# Installs a launchd (macOS) or systemd (Linux) service so it survives reboots.
```

The installer also prints the JSON snippet to paste into your agent config.

## Agent configuration (on the client machine)

**Claude Code / OpenClaw** — `~/.claude.json`:
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "http",
      "url": "https://<machine>.tailnet.ts.net/mcp"
    }
  }
}
```

**OpenCode** — `~/.config/opencode/opencode.json`:
```json
{
  "mcp": {
    "chrome-devtools": {
      "type": "remote",
      "url": "https://<machine>.tailnet.ts.net/mcp",
      "enabled": true
    }
  }
}
```

Once configured, the MCP tools (`navigate_page`, `take_screenshot`, `evaluate_script`, …) route to the remote browser automatically — no `--remote` flag needed.

## CLI scripting with --remote

For scripting or when an agent needs to call the CLI directly:

```bash
export CHROME_DEVTOOLS_MCP_REMOTE_URL="https://<machine>.tailnet.ts.net/mcp"

# Verify the server is up
chrome-devtools status --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"
# → remote=... status=ok http=200

# Chain commands — same server-side tab throughout
chrome-devtools navigate_page https://example.com --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"
chrome-devtools take_snapshot --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL" --output-format json
chrome-devtools take_screenshot --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"
```

Three flags for non-standard setups:
- `--header "Authorization: Bearer $TOKEN"` — bearer/static auth, repeatable
- `--insecure` — skip TLS verification for self-signed certs (or `CHROME_DEVTOOLS_MCP_REMOTE_INSECURE=1`)
- Session ids are cached at `~/.cache/chrome-devtools-mcp/remote/` (0600) so chained calls reuse the same tab

## Multiple agents, one server

The HTTP transport supports concurrent sessions. Each agent (Claude Code, Cursor, OpenCode …) gets its own session and tab state; they share a single browser and one serialized tool mutex. Sessions idle-expire after 10 min (tunable via `CHROME_DEVTOOLS_MCP_SESSION_IDLE_TTL_MS`).

## Failure modes

| Symptom | Fix |
| ------- | --- |
| `Failed to reach remote` | Check Tailscale is up; verify the URL ends in `/mcp` |
| `404 Session not found` | Server restarted; run `chrome-devtools stop --remote $URL` then retry |
| TLS verify error | Add `--insecure` (self-signed cert) |
| `chrome-devtools: command not found` | `npm install -g @vibebrowser/chrome-devtools-mcp` then add `$(npm config get prefix)/bin` to PATH |
