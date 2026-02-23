/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const LIGHTHOUSE_DIR = path.resolve(ROOT_DIR, '../lighthouse');
const DEST_DIR = path.join(ROOT_DIR, 'src/third_party');

function main() {
  if (!fs.existsSync(LIGHTHOUSE_DIR)) {
    console.error(`Lighthouse directory not found at ${LIGHTHOUSE_DIR}`);
    process.exit(1);
  }

  console.log('Running yarn in lighthouse directory...');
  execSync('yarn', {cwd: LIGHTHOUSE_DIR, stdio: 'inherit'});

  console.log('Building lighthouse-devtools-mcp bundle...');
  execSync('yarn build-devtools-mcp', {cwd: LIGHTHOUSE_DIR, stdio: 'inherit'});

  const bundlePath = path.join(
    LIGHTHOUSE_DIR,
    'dist',
    'lighthouse-devtools-mcp-bundle.js',
  );

  console.log(`Copying bundle from ${bundlePath} to ${DEST_DIR}...`);
  fs.copyFileSync(
    bundlePath,
    path.join(DEST_DIR, 'lighthouse-devtools-mcp-bundle.js'),
  );

  const noticesPath = path.join(
    LIGHTHOUSE_DIR,
    'dist',
    'LIGHTHOUSE_MCP_BUNDLE_THIRD_PARTY_NOTICES',
  );

  console.log(`Copying notices from ${noticesPath} to ${DEST_DIR}...`);
  fs.copyFileSync(
    noticesPath,
    path.join(DEST_DIR, 'LIGHTHOUSE_MCP_BUNDLE_THIRD_PARTY_NOTICES'),
  );

  console.log('Done.');
}

main();
