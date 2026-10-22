#!/bin/bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

CWD=$(pwd)
THIRD_PARTY_DIR="$CWD/third_party"
DEVTOOLS_DIR="$THIRD_PARTY_DIR/devtools-frontend"

echo "Setting up gclient in $THIRD_PARTY_DIR"

if command -v gclient >/dev/null 2>&1; then
  DEPOT_TOOLS_DIR="$(dirname "$(command -v gclient)")"
  echo "Using depot_tools from PATH ($DEPOT_TOOLS_DIR)."
else
  DEPOT_TOOLS_DIR="$THIRD_PARTY_DIR/depot_tools"
  if [ ! -d "$DEPOT_TOOLS_DIR" ]; then
    echo "Cloning depot_tools..."
    git clone \
      https://chromium.googlesource.com/chromium/tools/depot_tools.git \
      "$DEPOT_TOOLS_DIR"
  else
    echo "depot_tools already exists in $DEPOT_TOOLS_DIR."
  fi
  export PATH="$DEPOT_TOOLS_DIR:$PATH"

  if [ -n "${GITHUB_PATH:-}" ]; then
    echo "Adding depot_tools to GITHUB_PATH..."
    if command -v cygpath >/dev/null 2>&1; then
      cygpath -w "$DEPOT_TOOLS_DIR" >> "$GITHUB_PATH"
    else
      echo "$DEPOT_TOOLS_DIR" >> "$GITHUB_PATH"
    fi
  fi
fi

export DEPOT_TOOLS_WIN_TOOLCHAIN=0

echo "Creating .gclient in $THIRD_PARTY_DIR..."
(cd "$THIRD_PARTY_DIR" && gclient config --spec 'solutions = [
  {
    "name": "devtools-frontend",
    "url": None,
    "deps_file": "DEPS",
    "managed": False,
    "custom_deps": {
      "third_party/chrome/chrome-linux": None,
      "third_party/chrome/chrome-mac-x64": None,
      "third_party/chrome/chrome-mac-arm64": None,
      "third_party/chrome/chrome-win": None,
      "third_party/depot_tools": None,
    },
  },
]')

echo "Running gclient sync..."
(
  cd "$DEVTOOLS_DIR"
  gclient sync --nohooks
  PYTHONPATH="$DEPOT_TOOLS_DIR:${PYTHONPATH:-}" \
    vpython3 build/util/lastchange.py -o build/util/LASTCHANGE
  if [ -f scripts/deps/ensure_node_modules.py ]; then
    vpython3 scripts/deps/ensure_node_modules.py
  fi
)

echo "Linking DevTools DEPS and generating GN build files..."
node scripts/gn-gen.ts
