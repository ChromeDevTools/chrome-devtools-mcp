/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

// Polyfill for import.meta.dirname and import.meta.filename if not available
// (Node.js < 20.11 / 21.2)
const _filename = import.meta.filename ?? fileURLToPath(import.meta.url);
const _dirname = import.meta.dirname ?? path.dirname(_filename);

export const DAEMON_SCRIPT_PATH = path.join(_dirname, 'daemon.js');
export const INDEX_SCRIPT_PATH = path.join(_dirname, '..', 'index.js');

function getDataHome(): string {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  const platform = os.platform();
  const home = os.homedir();

  switch (platform) {
    case 'win32':
      return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    case 'darwin':
      return path.join(home, 'Library', 'Application Support');
    default:
      // linux, etc.
      return path.join(home, '.local', 'share');
  }
}

function getDaemonDir(): string {
  const dataHome = getDataHome();
  // Using a vendor-prefixed name for safety/standard practice
  return path.join(dataHome, 'google', 'chrome-devtools-mcp');
}

export async function getDaemonPaths() {
  const daemonDir = getDaemonDir();
  await fs.mkdir(daemonDir, {recursive: true});

  const pidFile = path.join(daemonDir, 'server.pid');

  const isWindows = os.platform() === 'win32';
  const socketPath = isWindows
    ? '\\\\.\\pipe\\chrome-devtools-mcp-daemon'
    : path.join(daemonDir, 'server.sock');

  return {
    pidFile,
    socketPath,
    daemonDir,
  };
}
