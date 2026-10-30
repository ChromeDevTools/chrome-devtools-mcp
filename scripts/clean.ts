/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {rmSync} from 'node:fs';
import {resolve} from 'node:path';

import {runGnGen} from './gn-gen.ts';

const projectRoot = process.cwd();
const pathsToRemove = ['out/Default/gen/src', 'out/Default/gen/tests'];

for (const relPath of pathsToRemove) {
  rmSync(resolve(projectRoot, relPath), {recursive: true, force: true});
}

runGnGen();
