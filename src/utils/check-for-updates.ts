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

import {semver} from '../third_party/cli.js';
import {VERSION} from '../version.js';

/**
 * Notifies the user if an update is available.
 * @param message The message to display in the update notification.
 */
let isChecking = false;

/** @internal */
export function resetUpdateCheckFlagForTesting(): void {
  isChecking = false;
}

export async function checkForUpdates(message: string): Promise<void> {
  if (isChecking || process.env['CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS']) {
    return;
  }
  isChecking = true;

  const cachePath = path.join(
    os.homedir(),
    '.cache',
    'chrome-devtools-mcp',
    'latest.json',
  );

  let cachedVersion: string | undefined;
  let stats: {mtimeMs: number} | undefined;
  try {
    stats = await fs.stat(cachePath);
    const data = await fs.readFile(cachePath, 'utf8');
    const version: unknown = JSON.parse(data).version;
    // A cache entry that is not a valid version would make `semver.lt` throw
    // before the refresh below runs, so every start would fail on the same
    // file. Ignore such an entry and let the refresh replace it.
    if (typeof version === 'string' && semver.valid(version)) {
      cachedVersion = version;
    }
  } catch {
    // Ignore errors reading cache.
  }

  if (cachedVersion && semver.lt(VERSION, cachedVersion)) {
    console.warn(
      `\nUpdate available: ${VERSION} -> ${cachedVersion}\n${message}\n`,
    );
  }

  const now = Date.now();
  if (stats && now - stats.mtimeMs < 24 * 60 * 60 * 1000) {
    return;
  }

  // Update mtime immediately to prevent multiple subprocesses.
  try {
    const parentDir = path.dirname(cachePath);
    await fs.mkdir(parentDir, {recursive: true});
    const nowTime = new Date();
    if (stats) {
      await fs.utimes(cachePath, nowTime, nowTime);
    } else {
      await fs.writeFile(cachePath, JSON.stringify({version: VERSION}));
    }
  } catch {
    // Ignore errors.
  }

  // In a separate process, check the latest available version number
  // and update the local snapshot accordingly.
  const scriptPath = path.join(
    import.meta.dirname,
    '..',
    'bin',
    'check-latest-version.js',
  );

  try {
    const child = child_process.spawn(
      process.execPath,
      [scriptPath, cachePath],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    child.unref();
  } catch {
    // Fail silently in case of any errors.
  }
}
