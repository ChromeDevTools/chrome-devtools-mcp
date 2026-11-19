/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';

export const BUILD_SRC: string = path.resolve(import.meta.dirname, '..', 'src');

const STATIC_IMPORT_RE = /\b(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const ANY_IMPORT_RE = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/**
 * Walks the relative imports of the built JS files and returns the first
 * path from `entry` to `target`, or undefined.
 */
export function findImportPath(
  entry: string,
  target: string,
  options: {includeDynamicImports: boolean},
): string[] | undefined {
  const importRe = options.includeDynamicImports
    ? ANY_IMPORT_RE
    : STATIC_IMPORT_RE;
  const parents = new Map<string, string | undefined>([[entry, undefined]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined) {
      break;
    }
    if (file === target) {
      const chain = [];
      for (let f: string | undefined = file; f; f = parents.get(f)) {
        chain.unshift(path.relative(BUILD_SRC, f));
      }
      return chain;
    }
    if (!file.startsWith(BUILD_SRC)) {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importRe)) {
      const next = path.resolve(path.dirname(file), match[1]);
      if (!parents.has(next)) {
        parents.set(next, file);
        queue.push(next);
      }
    }
  }
  return undefined;
}
