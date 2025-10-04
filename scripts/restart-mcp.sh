#!/bin/bash
# Restart chrome-devtools-mcp-for-extension MCP server
# Kills only this project's MCP processes

echo "🔍 Looking for chrome-devtools-mcp-for-extension processes..."

# Find PIDs for chrome-devtools-mcp-for-extension processes
PIDS=$(ps aux | grep "chrome-devtools-mcp-for-extension" | grep -v grep | awk '{print $2}')

if [ -z "$PIDS" ]; then
  echo "⚠️  No chrome-devtools-mcp-for-extension processes found"
  echo "💡 VSCode might need a Reload Window first"
  exit 0
fi

echo "📋 Found processes: $PIDS"

# Kill each process with -9 (force kill)
for PID in $PIDS; do
  echo "   Force killing PID $PID..."
  kill -9 $PID 2>/dev/null
done

# Wait a moment for processes to terminate
sleep 1

# Verify termination
REMAINING=$(ps aux | grep "chrome-devtools-mcp-for-extension" | grep -v grep)
if [ -z "$REMAINING" ]; then
  echo "✅ All chrome-devtools-mcp-for-extension processes terminated"
  echo ""
  echo "📢 Next step: Reload VSCode window"
  echo "   → Press Cmd+R or use Command Palette → 'Developer: Reload Window'"
else
  echo "❌ Failed to terminate some processes:"
  echo "$REMAINING"
  echo ""
  echo "💡 Try manually: kill -9 <PID>"
  exit 1
fi
