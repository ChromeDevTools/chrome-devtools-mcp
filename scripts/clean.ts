/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

import {getGnBinaryPath, runGnGen} from './gn-gen.ts';

const projectRoot = process.cwd();
const outDir = resolve(projectRoot, 'out', 'Default');

if (existsSync(resolve(outDir, 'build.ninja'))) {
  execFileSync(getGnBinaryPath(), ['clean', 'out/Default'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

runGnGen();
