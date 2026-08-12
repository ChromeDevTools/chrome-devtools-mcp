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

export async function resolveCanonicalPath(
  filePath: string,
  visited: Set<string> = new Set(),
): Promise<string> {
  const absolutePath = path.resolve(filePath);

  // Guard against symlink cycles (A -> B -> A) causing infinite recursion.
  if (visited.has(absolutePath)) {
    throw new Error(
      `Symlink cycle detected while resolving canonical path for: ${filePath}`,
    );
  }

  try {
    // Get the true canonical path, resolving all symlinks.
    return await fs.realpath(absolutePath);
  } catch (err) {
    if (
      !(
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'ENOENT'
      )
    ) {
      throw err;
    }

    // The path doesn't fully resolve via realpath. This can happen for two
    // different reasons that must be handled differently:
    //   (a) The path simply doesn't exist yet (e.g. a new output file that
    //       is about to be created) - in this case, falling back to the
    //       nearest existing ancestor directory + the requested basename is
    //       correct.
    //   (b) The path (or an ancestor of it) IS an existing symlink, but its
    //       target doesn't exist (a "dangling" symlink) - in this case we
    //       must resolve to where the symlink actually points, recursively.
    //       Otherwise, a dangling symlink placed inside an allowed root
    //       that points *outside* of it would be silently treated as if it
    //       were a plain new file inside the root, defeating root-based
    //       path validation.
    let current = absolutePath;
    const missingSegments: string[] = [];
    while (true) {
      try {
        const lstat = await fs.lstat(current);
        if (lstat.isSymbolicLink()) {
          const linkTarget = await fs.readlink(current);
          const resolvedTarget = path.isAbsolute(linkTarget)
            ? linkTarget
            : path.resolve(path.dirname(current), linkTarget);
          const nextVisited = new Set(visited);
          nextVisited.add(absolutePath);
          const canonicalTarget = await resolveCanonicalPath(
            resolvedTarget,
            nextVisited,
          );
          return path.join(canonicalTarget, ...missingSegments);
        }
      } catch (lstatErr) {
        if (
          !(
            lstatErr &&
            typeof lstatErr === 'object' &&
            'code' in lstatErr &&
            lstatErr.code === 'ENOENT'
          )
        ) {
          throw lstatErr;
        }
        // `current` doesn't exist at all (not even as a dangling symlink) -
        // fall through to the ancestor walk below.
      }

      const parent = path.dirname(current);
      if (parent === current) {
        // Reached root directory but still couldn't resolve anything.
        throw err;
      }
      try {
        const canonicalParent = await fs.realpath(parent);
        return path.join(
          canonicalParent,
          path.basename(current),
          ...missingSegments,
        );
      } catch (parentErr) {
        if (
          parentErr &&
          typeof parentErr === 'object' &&
          'code' in parentErr &&
          parentErr.code === 'ENOENT'
        ) {
          missingSegments.unshift(path.basename(current));
          current = parent;
        } else {
          throw parentErr;
        }
      }
    }
  }
}
