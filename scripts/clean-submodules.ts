/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {rmSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const projectRoot = process.cwd();

console.log('Cleaning submodules...');

const directoriesToRemove = [
  resolve(projectRoot, 'third_party', 'devtools-frontend'),
  resolve(projectRoot, '.git', 'modules', 'devtools-frontend'),
];

for (const dir of directoriesToRemove) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, {recursive: true, force: true});
      console.log(`Removed ${dir}`);
    }
  } catch (error) {
    console.error(`Failed to remove ${dir}:`, error);
  }
}

console.log('Submodules cleaned. You can now run `npm run prepare` to re-initialize them.');
