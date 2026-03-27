/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {VERSION} from '../version.js';

/**
 * Notifies the user if an update is available.
 * @param message The message to display in the update notification.
 */
export async function checkForUpdates(message: string) {
  const cachePath = path.join(
    os.homedir(),
    '.cache',
    'chrome-devtools-mcp',
    'latest.json',
  );

  let cache: {version: string; timestamp: number} | undefined;
  try {
    const data = await fs.readFile(cachePath, 'utf8');
    cache = JSON.parse(data);
  } catch {
    // Ignore errors reading cache.
  }

  if (cache && typeof cache.version === 'string' && cache.version !== VERSION) {
    console.warn(
      `\nUpdate available: ${VERSION} -> ${cache.version}\n${message}\n`,
    );
  }

  const now = Date.now();
  if (cache && now - cache.timestamp < 24 * 60 * 60 * 1000) {
    return;
  }

  // In a separate process, check the latest available version number
  // and update the local snapshot accordingly.
  const scriptPath = path.join(import.meta.dirname, '..', 'bin', 'check-latest-version.js');

  try {
    const child = child_process.spawn(
      process.execPath,
      [scriptPath, cachePath],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    child.unref();
  } catch {
    // Fail silently in case of any errors.
  }
}
