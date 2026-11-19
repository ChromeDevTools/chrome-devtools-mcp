/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';

import type {DownloadBehavior} from '../third_party/browser.js';

/**
 * Returns the Puppeteer download behavior for `--downloadsDir`, or
 * `undefined` to keep Chrome's default behavior.
 */
export function downloadBehaviorFor(
  downloadsDir: string | undefined,
): DownloadBehavior | undefined {
  if (!downloadsDir) {
    return undefined;
  }
  return {policy: 'allow', downloadPath: downloadsDir};
}

/**
 * Creates `downloadsDir` if it is missing. Throws if the path cannot be
 * created as a directory, for example because a file exists at the path.
 */
export function prepareDownloadsDir(downloadsDir: string): void {
  try {
    fs.mkdirSync(downloadsDir, {recursive: true});
  } catch (err) {
    const code =
      err instanceof Error && 'code' in err ? String(err.code) : 'unknown';
    throw new Error(
      `Invalid downloadsDir ${downloadsDir}. Could not create the directory (${code}).`,
      {cause: err},
    );
  }
}
