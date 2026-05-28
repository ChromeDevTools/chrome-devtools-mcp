#!/usr/bin/env bash
#
# Set up chrome-devtools-mcp as a long-lived HTTP service shared by every
# Claude Code session on this machine. macOS (launchd user agent) variant.
#
# Requirements: macOS, `node`, `openssl`, `curl`, `claude` CLI on PATH.
# Build the fork first: `npm run build`.
#
# Usage:
#   ./scripts/setup-shared-mcp.macos.sh
#   PORT=9000 FORCE=1 ./scripts/setup-shared-mcp.macos.sh
#
set -euo pipefail

PORT="${PORT:-9876}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_PATH="${FORK_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"

CONFIG_DIR="$HOME/Library/Application Support/cdmcp"
TOKEN_FILE="$CONFIG_DIR/token"
LOG_DIR="$HOME/Library/Logs/cdmcp"
PROFILE_DIR="$CONFIG_DIR/chrome-profile"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
LABEL="dev.cejor6.chromedevtoolsmcp"
PLIST_FILE="$LAUNCH_DIR/$LABEL.plist"

CDMCP_JS="$FORK_PATH/build/src/bin/chrome-devtools-mcp.js"
[[ -f "$CDMCP_JS" ]] || { echo "Fork build not found at $CDMCP_JS. Run 'npm run build' in $FORK_PATH first."; exit 1; }
NODE="$(command -v node)"
[[ -n "$NODE" ]] || { echo "node not found on PATH"; exit 1; }
command -v launchctl >/dev/null || { echo "launchctl not found"; exit 1; }
command -v claude    >/dev/null || { echo "claude CLI not found on PATH"; exit 1; }

mkdir -p "$CONFIG_DIR" "$LOG_DIR" "$PROFILE_DIR" "$LAUNCH_DIR"

if [[ ! -f "$TOKEN_FILE" || "${FORCE:-0}" == "1" ]]; then
    TOKEN="$(openssl rand -hex 32)"
    printf '%s' "$TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "Token:           generated ($TOKEN_FILE)"
else
    TOKEN="$(cat "$TOKEN_FILE")"
    echo "Token:           reused existing ($TOKEN_FILE)"
fi

cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE</string>
        <string>$CDMCP_JS</string>
        <string>--experimentalPageIdRouting</string>
        <string>--http-port</string><string>$PORT</string>
        <string>--http-host</string><string>127.0.0.1</string>
        <string>--http-token</string><string>$TOKEN</string>
        <string>--user-data-dir</string><string>$PROFILE_DIR</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS</key><string>true</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key><false/>
    </dict>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>StandardOutPath</key><string>$LOG_DIR/server.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/server.log</string>
</dict>
</plist>
EOF

echo "LaunchAgent:     $PLIST_FILE"

launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load   "$PLIST_FILE"
echo "LaunchAgent:     loaded"

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
echo "  LaunchAgent:    launchctl list | grep $LABEL"
echo
echo "Restart any open Claude Code windows to pick up the new MCP config."
echo "To uninstall:   ./scripts/uninstall-shared-mcp.macos.sh"
