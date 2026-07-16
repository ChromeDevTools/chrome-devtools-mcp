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

// Upper bound on the number of nested symlinks resolved for a not-yet-existing
// target. Mirrors the kernel's SYMLOOP_MAX and prevents an unbounded loop when
// dangling symlinks form a cycle (fs.realpath() would report such a cycle as
// ELOOP, but it never reaches those links because their targets do not exist).
const MAX_SYMLINK_DEPTH = 40;

export async function resolveCanonicalPath(
  filePath: string,
  symlinkDepth = 0,
): Promise<string> {
  const absolutePath = path.resolve(filePath);
  try {
    // Get the true canonical path, resolving all symlinks.
    return await fs.realpath(absolutePath);
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      err.code === 'ENOENT'
    ) {
      // Find the nearest existing ancestor directory on the filesystem.
      let current = absolutePath;
      const missingSegments: string[] = [];
      while (true) {
        // A dangling symlink (one whose target does not exist yet) is reported
        // as ENOENT by fs.realpath(), so the walk below would otherwise treat
        // the link's own name as an ordinary missing segment and re-append it
        // verbatim. That yields an in-tree path even though a follow-the-link
        // write lands wherever the link points. Resolve such a link explicitly
        // so the returned canonical path reflects the real write destination
        // and MCP roots validation cannot be bypassed by a symlink placed
        // inside a configured root.
        let linkStat;
        try {
          linkStat = await fs.lstat(current);
        } catch {
          linkStat = undefined;
        }
        if (linkStat?.isSymbolicLink()) {
          if (symlinkDepth >= MAX_SYMLINK_DEPTH) {
            throw err;
          }
          const linkTarget = path.resolve(
            path.dirname(current),
            await fs.readlink(current),
          );
          return await resolveCanonicalPath(
            path.join(linkTarget, ...missingSegments),
            symlinkDepth + 1,
          );
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
    } else {
      throw err;
    }
  }
}
