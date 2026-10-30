/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function getTempFilePath(filename: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));

  const filepath = path.join(dir, filename);
  return filepath;
}

/**
 * Converts a client-supplied `file:` URL to a path. On Windows, a URL with no
 * host and no drive letter (`file:///home/user/project`) is read as a POSIX
 * path instead of throwing: a WSL2 client sends such URLs to a Windows-side
 * server. Callers resolve the result against the working directory, which for
 * a server started from WSL is `\\wsl.localhost\<distro>\...`.
 */
export function fileUrlToPath(
  url: string | URL,
  windows: boolean = process.platform === 'win32',
): string {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  const hasDriveLetter = /^\/[a-z](:|%3a)/i.test(parsed.pathname);
  if (windows && parsed.hostname === '' && !hasDriveLetter) {
    return fileURLToPath(parsed, {windows: false});
  }
  return fileURLToPath(parsed, {windows});
}

export async function resolveCanonicalPath(filePath: string): Promise<string> {
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
