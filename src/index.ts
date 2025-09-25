#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const [major, minor] = process.version.substring(1).split('.').map(Number);

if (major < 22 || (major === 22 && minor < 12)) {
  console.error(
    `ERROR: \`chrome-devtools-mcp\` does not support Node ${process.version}. Please upgrade to Node 22.12.0 or newer.`,
  );
  process.exit(1);
}

await import('./main.js');
