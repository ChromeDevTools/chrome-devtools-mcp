#!/bin/sh
set -e

# Build command with optional connection arguments
CMD="node build/src/index.js"

# Add browserUrl if BROWSER_URL is set and not empty
if [ -n "$BROWSER_URL" ]; then
  CMD="$CMD --browserUrl $BROWSER_URL"
fi

# Add wsEndpoint if WS_ENDPOINT is set and not empty
if [ -n "$WS_ENDPOINT" ]; then
  CMD="$CMD --wsEndpoint $WS_ENDPOINT"
fi

# Add wsHeaders if WS_HEADERS is set and not empty
if [ -n "$WS_HEADERS" ]; then
  CMD="$CMD --wsHeaders '$WS_HEADERS'"
fi

# Execute the command with any additional arguments
exec $CMD "$@"
