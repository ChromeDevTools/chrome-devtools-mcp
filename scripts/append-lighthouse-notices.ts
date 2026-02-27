/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const TARGET_DIR = path.join(ROOT_DIR, 'build/src/third_party');
const SOURCE_DIR = path.join(ROOT_DIR, 'src/third_party');

function main() {
  const lighthouseNotices = fs.readFileSync(
    path.join(SOURCE_DIR, 'LIGHTHOUSE_MCP_BUNDLE_THIRD_PARTY_NOTICES'),
    'utf8',
  );
  const bundledNotices = fs.readFileSync(
    path.join(TARGET_DIR, 'THIRD_PARTY_NOTICES'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(TARGET_DIR, 'THIRD_PARTY_NOTICES'),
    bundledNotices +
      '\n\n-------------------- DEPENDENCY DIVIDER --------------------\n\n' +
      lighthouseNotices,
  );
  console.log('Done.');
}

main();
