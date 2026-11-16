/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {cpSync, writeFileSync} from 'node:fs';

const [srcDir, destDir, stampFile] = process.argv.slice(2);
if (!srcDir || !destDir || !stampFile) {
  throw new Error(
    'Usage: node copy-issue-descriptions.ts <srcDir> <destDir> <stampFile>',
  );
}

cpSync(srcDir, destDir, {recursive: true});
writeFileSync(stampFile, '');
