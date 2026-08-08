/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function getTempFilePath(filename: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));

  const filepath = path.join(dir, filename);
  return filepath;
}

function isENOENT(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT'
  );
}

// Matches the conventional SYMLOOP_MAX so a cycle of dangling links cannot
// recurse without bound.
const MAX_SYMLINK_DEPTH = 40;

export async function resolveCanonicalPath(
  filePath: string,
  depth = 0,
): Promise<string> {
  const absolutePath = path.resolve(filePath);
  try {
    // Get the true canonical path, resolving all symlinks.
    return await fs.realpath(absolutePath);
  } catch (err) {
    if (isENOENT(err)) {
      // realpath() also reports ENOENT for a symlink whose target does not
      // exist. Treating that as a missing path would fall through to the
      // ancestor walk below and return the link's own location, which hides
      // the fact that writing to it lands wherever the link points. Follow the
      // link explicitly instead, so the caller sees the real destination.
      let linkStat;
      try {
        linkStat = await fs.lstat(absolutePath);
      } catch {
        linkStat = undefined;
      }
      if (linkStat?.isSymbolicLink()) {
        if (depth >= MAX_SYMLINK_DEPTH) {
          throw err;
        }
        const target = await fs.readlink(absolutePath);
        const resolvedTarget = path.resolve(
          path.dirname(absolutePath),
          target,
        );
        if (resolvedTarget === absolutePath) {
          throw err;
        }
        return await resolveCanonicalPath(resolvedTarget, depth + 1);
      }

      // Find the nearest existing ancestor directory on the filesystem.
      let current = absolutePath;
      const missingSegments: string[] = [];
      while (true) {
        const parent = path.dirname(current);
        if (parent === current) {
          // Reached root directory but still couldn't resolve anything.
          throw err;
        }
        try {
          // Resolve the parent through this function rather than realpath() so
          // that a dangling symlink used as an intermediate directory is
          // followed to its destination as well.
          const canonicalParent = await resolveCanonicalPath(parent, depth + 1);
          return path.join(
            canonicalParent,
            path.basename(current),
            ...missingSegments,
          );
        } catch (parentErr) {
          if (isENOENT(parentErr)) {
            missingSegments.unshift(path.basename(current));
            current = parent;
          } else {
            throw parentErr;
          }
        }
      }
    } else {
      throw err;
    }
  }
}
