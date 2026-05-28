#!/usr/bin/env bash
#
# Roll back the setup created by setup-shared-mcp.linux.sh.
#
# Usage:
#   ./scripts/uninstall-shared-mcp.linux.sh                  # interactive
#   KEEP_DATA=1 ./scripts/uninstall-shared-mcp.linux.sh      # keep token + logs
#   RESTORE_STDIO=1 ./scripts/uninstall-shared-mcp.linux.sh  # re-add stdio variant
#
set -euo pipefail

CONFIG_DIR="$HOME/.config/cdmcp"
STATE_DIR="$HOME/.local/state/cdmcp"
DATA_DIR="$HOME/.local/share/cdmcp"
SERVICE_FILE="$HOME/.config/systemd/user/chrome-devtools-mcp.service"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_PATH="${FORK_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if systemctl --user list-unit-files chrome-devtools-mcp.service >/dev/null 2>&1; then
    systemctl --user stop    chrome-devtools-mcp.service 2>/dev/null || true
    systemctl --user disable chrome-devtools-mcp.service 2>/dev/null || true
    echo "Service:         stopped + disabled"
fi
if [[ -f "$SERVICE_FILE" ]]; then
    rm -f "$SERVICE_FILE"
    systemctl --user daemon-reload
    echo "Service unit:    removed"
fi

if command -v claude >/dev/null; then
    claude mcp remove chrome-devtools --scope user >/dev/null 2>&1 || true
    echo "Claude Code:     chrome-devtools removed from user config"
fi

if [[ "${RESTORE_STDIO:-0}" == "1" ]]; then
    CDMCP_JS="$FORK_PATH/build/src/bin/chrome-devtools-mcp.js"
    if [[ -f "$CDMCP_JS" ]]; then
        claude mcp add chrome-devtools --scope user -- node "$CDMCP_JS" --experimentalPageIdRouting
        echo "Claude Code:     stdio variant restored"
    else
        echo "Stdio restore skipped: $CDMCP_JS not found" >&2
    fi
fi

if [[ "${KEEP_DATA:-0}" != "1" ]]; then
    echo
    echo "Remove the following directories?"
    echo "  - $CONFIG_DIR"
    echo "  - $STATE_DIR"
    echo "  - $DATA_DIR"
    read -rp "[y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
        rm -rf "$CONFIG_DIR" "$STATE_DIR" "$DATA_DIR"
        echo "Removed"
    else
        echo "Kept"
    fi
fi

echo
echo "Done. Restart any open Claude Code windows."
