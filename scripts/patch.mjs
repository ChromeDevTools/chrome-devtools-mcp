/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const file = path.join(
  process.cwd(),
  'node_modules',
  '@puppeteer',
  'browsers',
  'lib',
  'fileUtil.js',
);

if (!fs.existsSync(file)) {
  console.error(
    'File not found. Make sure you run this from the project root and npm install has been run.',
  );
  process.exit(1);
}

const search =
  "await execFileAsync('tar.exe', ['-xf', archivePath, '-C', folderPath]);";

// Double escape the backslashes so they write as single backslashes into the target file
const replace = `const systemRoot = process.env['SystemRoot'] ?? process.env['SYSTEMROOT'] ?? 'C:\\\\Windows';
      const systemTar = \`\${systemRoot}\\\\System32\\\\tar.exe\`;
      await execFileAsync(systemTar, ['-xf', archivePath, '-C', folderPath]);`;

let content = fs.readFileSync(file, 'utf8');

if (content.includes(search)) {
  fs.writeFileSync(file, content.replace(search, replace));
  console.log('Patch applied successfully.');
} else {
  console.log('Target string not found. Already patched?');
}
