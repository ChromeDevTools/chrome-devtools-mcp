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
const DEST_PATH = path.join(
  ROOT_DIR,
  'src/third_party/lighthouse-devtools-mcp-bundle.js',
);

function main() {
  if (!fs.existsSync(LIGHTHOUSE_DIR)) {
    console.error(`Lighthouse directory not found at ${LIGHTHOUSE_DIR}`);
    process.exit(1);
  }

  console.log('Running yarn in lighthouse directory...');
  execSync('yarn', {cwd: LIGHTHOUSE_DIR, stdio: 'inherit'});

  console.log('Building lighthouse-devtools-mcp bundle...');
  execSync('yarn build-devtools-mcp', {cwd: LIGHTHOUSE_DIR, stdio: 'inherit'});

  // Look for the bundle in dist/ or root
  const potentialPaths = [
    path.join(LIGHTHOUSE_DIR, 'dist', 'lighthouse-devtools-mcp-bundle.js'),
    path.join(LIGHTHOUSE_DIR, 'lighthouse-devtools-mcp-bundle.js'),
  ];

  let bundlePath = '';
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      bundlePath = p;
      break;
    }
  }

  if (!bundlePath) {
    console.error(
      `Could not find built bundle. Checked:\n${potentialPaths.join('\n')}`,
    );
    process.exit(1);
  }

  console.log(`Copying bundle from ${bundlePath} to ${DEST_PATH}...`);
  fs.copyFileSync(bundlePath, DEST_PATH);

  console.log('Done.');
}

main();
