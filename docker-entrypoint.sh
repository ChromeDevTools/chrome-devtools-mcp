#!/bin/sh
set -e

# Build command with optional arguments
CMD="node build/src/index.js"

# Connection Options
if [ -n "$BROWSER_URL" ]; then
  CMD="$CMD --browserUrl $BROWSER_URL"
fi

if [ -n "$WS_ENDPOINT" ]; then
  CMD="$CMD --wsEndpoint $WS_ENDPOINT"
fi

if [ -n "$WS_HEADERS" ]; then
  CMD="$CMD --wsHeaders '$WS_HEADERS'"
fi

# Browser Launch Options
if [ -n "$HEADLESS" ]; then
  if [ "$HEADLESS" = "false" ]; then
    CMD="$CMD --no-headless"
  else
    CMD="$CMD --headless"
  fi
fi

if [ -n "$VIEWPORT" ]; then
  CMD="$CMD --viewport $VIEWPORT"
fi

if [ -n "$ISOLATED" ] && [ "$ISOLATED" = "true" ]; then
  CMD="$CMD --isolated"
fi

if [ -n "$CHANNEL" ]; then
  CMD="$CMD --channel $CHANNEL"
fi

if [ -n "$EXECUTABLE_PATH" ]; then
  CMD="$CMD --executablePath $EXECUTABLE_PATH"
fi

if [ -n "$PROXY_SERVER" ]; then
  CMD="$CMD --proxyServer $PROXY_SERVER"
fi

if [ -n "$ACCEPT_INSECURE_CERTS" ] && [ "$ACCEPT_INSECURE_CERTS" = "true" ]; then
  CMD="$CMD --acceptInsecureCerts"
fi

# Feature Toggles
if [ -n "$CATEGORY_EMULATION" ] && [ "$CATEGORY_EMULATION" = "false" ]; then
  CMD="$CMD --no-category-emulation"
fi

if [ -n "$CATEGORY_PERFORMANCE" ] && [ "$CATEGORY_PERFORMANCE" = "false" ]; then
  CMD="$CMD --no-category-performance"
fi

if [ -n "$CATEGORY_NETWORK" ] && [ "$CATEGORY_NETWORK" = "false" ]; then
  CMD="$CMD --no-category-network"
fi

# Debugging
if [ -n "$LOG_FILE" ]; then
  CMD="$CMD --logFile $LOG_FILE"
fi

# Execute the command
exec $CMD "$@"
