/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {lstatSync, rmSync, symlinkSync} from 'node:fs';
import {resolve} from 'node:path';

export function linkDevToolsDeps(): void {
  const root = process.cwd();
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  const links: Array<[string, string]> = [
    ['build', 'third_party/devtools-frontend/build'],
    ['build_overrides', 'third_party/devtools-frontend/build_overrides'],
    ['buildtools', 'third_party/devtools-frontend/buildtools'],
    ['third_party/ninja', 'devtools-frontend/third_party/ninja'],
    ['third_party/node', 'devtools-frontend/third_party/node'],
    ['third_party/typescript', 'devtools-frontend/third_party/typescript'],
    ['third_party/cpython3', 'devtools-frontend/third_party/cpython3'],
  ];

  for (const [linkRel, targetRel] of links) {
    const linkPath = resolve(root, linkRel);
    const targetPath =
      process.platform === 'win32'
        ? resolve(linkPath, '..', targetRel)
        : targetRel;
    try {
      const stat = lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        rmSync(linkPath, {force: true});
      } else {
        rmSync(linkPath, {recursive: true, force: true});
      }
    } catch {
      // Path does not exist yet.
    }
    symlinkSync(targetPath, linkPath, type);
  }
}

if (import.meta.main) {
  linkDevToolsDeps();
}
