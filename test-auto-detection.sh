#!/bin/bash

echo "Testing Chrome DevTools MCP auto-detection..."
echo "Starting server with no arguments..."
echo ""

# Run the server and capture stderr output for 3 seconds
timeout 3 node build/src/index.js 2>&1 | grep -E "Using|Chrome|profile|extensions|bookmarks|Auto-detected" || true

echo ""
echo "Test complete."