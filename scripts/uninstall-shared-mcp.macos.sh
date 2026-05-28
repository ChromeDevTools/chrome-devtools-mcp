#!/usr/bin/env bash
#
# Roll back the setup created by setup-shared-mcp.macos.sh.
#
# Usage:
#   ./scripts/uninstall-shared-mcp.macos.sh                  # interactive
#   KEEP_DATA=1 ./scripts/uninstall-shared-mcp.macos.sh      # keep token + logs
#   RESTORE_STDIO=1 ./scripts/uninstall-shared-mcp.macos.sh  # re-add stdio variant
#
set -euo pipefail

CONFIG_DIR="$HOME/Library/Application Support/cdmcp"
LOG_DIR="$HOME/Library/Logs/cdmcp"
LABEL="dev.cejor6.chromedevtoolsmcp"
PLIST_FILE="$HOME/Library/LaunchAgents/$LABEL.plist"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_PATH="${FORK_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [[ -f "$PLIST_FILE" ]]; then
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    rm -f "$PLIST_FILE"
    echo "LaunchAgent:     unloaded + removed"
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
    echo "  - $LOG_DIR"
    read -rp "[y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
        rm -rf "$CONFIG_DIR" "$LOG_DIR"
        echo "Removed"
    else
        echo "Kept"
    fi
fi

echo
echo "Done. Restart any open Claude Code windows."
