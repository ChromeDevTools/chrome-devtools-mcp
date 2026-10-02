/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// A file URL whose path is a Windows drive path. Node accepts the colon
// percent-encoded (`file:///c%3A/Users`), so both spellings have to match here
// or the encoded one is read as POSIX and comes back as `/c:/Users`.
const WINDOWS_DRIVE_FILE_URL_PATH = /^\/[a-z](:|%3a)/i;

/**
 * Resolves a client-supplied `file:` URI to an absolute path on this machine,
 * interpreting the URI with the path semantics it was written in.
 *
 * A WSL2 client can launch a Windows-side server through WSL interop (Windows
 * `node.exe`), and it then addresses its own workspace with POSIX file URIs
 * such as `file:///home/user/project`. `fileURLToPath()` rejects those on
 * Windows with ERR_INVALID_FILE_URL_PATH, even though the same path resolves
 * correctly against the server's UNC working directory. Reading those URIs
 * with POSIX semantics and resolving them here yields the same canonical form
 * the matching plain path resolves to.
 *
 * Every client-supplied `file:` URI has to go through here, not just the
 * advertised roots: a root that failed to resolve made the workspace
 * unreachable, and a tool argument that failed to resolve was reported as an
 * unreadable path. Mixing the two interpretations is what made a request
 * denied even when it pointed inside an allowed root.
 *
 * Drive-letter (`file:///C:/src`, `file:///c%3A/Users`) and UNC
 * (`file://server/share`, including `file://wsl.localhost/…`) URIs keep Windows
 * semantics; only an unambiguous POSIX path is reinterpreted. This only
 * decides how the URI text is decoded — callers still have to run the result
 * through `validatePath()` for the workspace-root containment check.
 *
 * `windows` defaults to the host platform and exists so the Windows behaviour
 * is testable from any host; the POSIX path is then resolved against the real
 * working directory, so the UNC-working-directory case still needs Windows.
 */
export function resolveFileUriPath(
  uri: URL | string,
  windows = process.platform === 'win32',
): string {
  const url = typeof uri === 'string' ? new URL(uri) : uri;
  const isPosixPath =
    url.hostname === '' && !WINDOWS_DRIVE_FILE_URL_PATH.test(url.pathname);
  const pathModule = windows ? path.win32 : path.posix;
  return pathModule.resolve(
    fileURLToPath(url, isPosixPath ? {windows: false} : {windows}),
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
