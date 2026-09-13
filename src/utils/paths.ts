/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const APP_NAME = 'chrome-devtools-mcp';

/**
 * The per-user data directory for this server, following the conventions of
 * the host operating system. It is keyed off this server's own name, never off
 * the MCP client's, so it is the same whichever client launched us.
 */
export function getDataFolder(): string {
  const homedir = os.homedir();
  const {env} = process;

  if (process.platform === 'darwin') {
    return path.join(homedir, 'Library', 'Application Support', APP_NAME);
  }

  if (process.platform === 'win32') {
    const localAppData =
      env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
    return path.join(localAppData, APP_NAME, 'Data');
  }

  return path.join(
    env.XDG_DATA_HOME || path.join(homedir, '.local', 'share'),
    APP_NAME,
  );
}

/**
 * A spelling of `filePath` for user-facing text, with the home directory
 * written as `~` so that the text does not bake in the account the server
 * happens to run as.
 */
export function displayPath(filePath: string): string {
  const homedir = os.homedir();
  if (homedir && filePath.startsWith(homedir + path.sep)) {
    return `~${filePath.slice(homedir.length)}`;
  }
  return filePath;
}
