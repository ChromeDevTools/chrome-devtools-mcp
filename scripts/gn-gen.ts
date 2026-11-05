/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {linkDevToolsDeps} from './link-devtools-deps.ts';

const projectRoot = process.cwd();

export function getGnBinaryPath(): string {
  switch (process.platform) {
    case 'win32':
      return resolve(projectRoot, 'buildtools', 'win', 'gn.exe');
    case 'darwin':
      return resolve(projectRoot, 'buildtools', 'mac', 'gn');
    default:
      return resolve(projectRoot, 'buildtools', 'linux64', 'gn');
  }
}

export function runGnGen(): void {
  linkDevToolsDeps();
  execFileSync(getGnBinaryPath(), ['gen', 'out/Default'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  // Empty .gitignore so npm pack includes gen/ and GN regeneration keeps it.
  writeFileSync(resolve(projectRoot, 'out', 'Default', '.gitignore'), '');
}

if (import.meta.main) {
  runGnGen();
}
