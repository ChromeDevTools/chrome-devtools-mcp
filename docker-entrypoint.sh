#!/bin/sh
set -e

# Build command with optional arguments
CMD="node build/src/index.js"

# Add browserUrl if BROWSER_URL is set and not empty
if [ -n "$BROWSER_URL" ]; then
  CMD="$CMD --browserUrl $BROWSER_URL"
fi

# Execute the command
exec $CMD "$@"
