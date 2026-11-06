/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execFileSync} from 'node:child_process';
import {rmSync} from 'node:fs';
import {resolve} from 'node:path';

import {linkDevToolsDeps} from './link-devtools-deps.ts';

const projectRoot = process.cwd();

function getGnBinaryPath(): string {
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

  // Remove the generated .gitignore so npm pack / publish includes out/Default/gen.
  rmSync(resolve(projectRoot, 'out', 'Default', '.gitignore'), {force: true});
}

if (import.meta.main) {
  runGnGen();
}
