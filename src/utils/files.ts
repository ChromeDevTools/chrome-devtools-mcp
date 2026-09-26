/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// A file URL whose path is a Windows drive path, e.g. `file:///C:/src`.
const WINDOWS_DRIVE_FILE_URL_PATH = /^\/[a-zA-Z]:/;

/**
 * Resolves a client-advertised file URI to an absolute path on this machine,
 * interpreting the URI with the path semantics it was written in.
 *
 * A WSL2 client can launch a Windows-side server through WSL interop (Windows
 * `node.exe`), and it then advertises POSIX roots such as
 * `file:///home/user/project`. `fileURLToPath()` rejects those on Windows with
 * ERR_INVALID_FILE_URL_PATH, which dropped every such root and made every path
 * inside the project fail with "Access denied", even though the requested path
 * itself resolved correctly against the server's UNC working directory.
 * Reading those URIs with POSIX semantics and resolving them here yields the
 * same canonical form the requested path resolves to.
 *
 * Drive-letter (`file:///C:/src`) and UNC (`file://server/share`) URIs keep
 * Windows semantics; only unambiguous POSIX paths are reinterpreted.
 */
export function resolveFileUriPath(uri: string): string {
  const url = new URL(uri);
  const isPosixPath =
    url.hostname === '' &&
    url.pathname.startsWith('/') &&
    !WINDOWS_DRIVE_FILE_URL_PATH.test(url.pathname);
  return path.resolve(
    fileURLToPath(url, isPosixPath ? {windows: false} : undefined),
  );
}

export async function getTempFilePath(filename: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));

  const filepath = path.join(dir, filename);
  return filepath;
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
