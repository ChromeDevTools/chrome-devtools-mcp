#!/usr/bin/env bash
#
# Set up chrome-devtools-mcp as a long-lived HTTP service shared by every
# Claude Code session on this machine. Linux (systemd user service) variant.
#
# Requirements: systemd-based distro with user services (typical Ubuntu /
# Fedora / Arch desktop), `node`, `openssl`, `curl`, and the `claude` CLI
# on PATH. Build the fork first: `npm run build`.
#
# Usage:
#   ./scripts/setup-shared-mcp.linux.sh
#   PORT=9000 FORCE=1 ./scripts/setup-shared-mcp.linux.sh
#
set -euo pipefail

PORT="${PORT:-9876}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_PATH="${FORK_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"

CONFIG_DIR="$HOME/.config/cdmcp"
TOKEN_FILE="$CONFIG_DIR/token"
LOG_DIR="$HOME/.local/state/cdmcp/logs"
PROFILE_DIR="$HOME/.local/share/cdmcp/chrome-profile"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/chrome-devtools-mcp.service"

CDMCP_JS="$FORK_PATH/build/src/bin/chrome-devtools-mcp.js"
[[ -f "$CDMCP_JS" ]] || { echo "Fork build not found at $CDMCP_JS. Run 'npm run build' in $FORK_PATH first."; exit 1; }
NODE="$(command -v node)"
[[ -n "$NODE" ]] || { echo "node not found on PATH"; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl not found; this script requires systemd."; exit 1; }
command -v claude    >/dev/null || { echo "claude CLI not found on PATH"; exit 1; }

mkdir -p "$CONFIG_DIR" "$LOG_DIR" "$PROFILE_DIR" "$SERVICE_DIR"

if [[ ! -f "$TOKEN_FILE" || "${FORCE:-0}" == "1" ]]; then
    TOKEN="$(openssl rand -hex 32)"
    printf '%s' "$TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "Token:           generated ($TOKEN_FILE)"
else
    TOKEN="$(cat "$TOKEN_FILE")"
    echo "Token:           reused existing ($TOKEN_FILE)"
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Chrome DevTools MCP shared HTTP server (cejor6 fork)
After=graphical-session.target

[Service]
Type=simple
Environment=CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=true
ExecStart=$NODE $CDMCP_JS \\
    --experimentalPageIdRouting \\
    --http-port $PORT \\
    --http-host 127.0.0.1 \\
    --http-token $TOKEN \\
    --user-data-dir "$PROFILE_DIR"
Restart=on-failure
RestartSec=10
StandardOutput=append:$LOG_DIR/server.log
StandardError=inherit

[Install]
WantedBy=default.target
EOF

echo "Service unit:    $SERVICE_FILE"

systemctl --user daemon-reload
systemctl --user enable chrome-devtools-mcp.service >/dev/null
systemctl --user restart chrome-devtools-mcp.service
echo "Service:         enabled + restarted"

echo -n "Waiting for HTTP endpoint... "
ready=false
for _ in {1..60}; do
    status=$(curl -sf -o /dev/null -w '%{http_code}' \
        -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{}' \
        --max-time 2 \
        "http://127.0.0.1:$PORT/mcp" 2>/dev/null || echo "000")
    if [[ "$status" =~ ^[0-9]+$ && "$status" -ge 200 && "$status" -lt 500 ]]; then
        ready=true
        break
    fi
    sleep 0.5
done
$ready || { echo "FAILED"; echo "See log: $LOG_DIR/server.log"; exit 1; }
echo "ready"

claude mcp remove chrome-devtools --scope user >/dev/null 2>&1 || true
claude mcp add chrome-devtools \
    --scope user \
    --transport http \
    --header "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:$PORT/mcp"
echo "Claude Code:     chrome-devtools rewired to http://127.0.0.1:$PORT/mcp"

echo
echo "=== Setup complete ==="
echo "  Token file:     $TOKEN_FILE"
echo "  Profile dir:    $PROFILE_DIR"
echo "  Logs:           $LOG_DIR/server.log"
echo "  Service:        systemctl --user status chrome-devtools-mcp"
echo
echo "Restart any open Claude Code windows to pick up the new MCP config."
echo "To uninstall:   ./scripts/uninstall-shared-mcp.linux.sh"
