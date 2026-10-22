/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

import {runGnGen} from './gn-gen.ts';

const projectRoot = process.cwd();
const outDir = resolve(projectRoot, 'out', 'Default');

if (!existsSync(resolve(outDir, 'build.ninja'))) {
  runGnGen();
}

const ninjaBinary = resolve(
  projectRoot,
  'third_party',
  'ninja',
  process.platform === 'win32' ? 'ninja.exe' : 'ninja',
);

execFileSync(ninjaBinary, ['-C', 'out/Default', ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
});
