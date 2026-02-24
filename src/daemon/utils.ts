/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const DAEMON_SCRIPT_PATH = path.join(import.meta.dirname, 'daemon.js');
export const INDEX_SCRIPT_PATH = path.join(
  import.meta.dirname,
  '..',
  'index.js',
);

const APP_NAME = 'chrome-devtools-mcp';

// Using these paths due to strict limits on the POSIX socket path length.
export function getSocketPath(): string {
  const uid = os.userInfo().uid;

  if (IS_WINDOWS) {
    // Windows uses Named Pipes, not file paths.
    // This format is required for server.listen()
    return path.join('\\\\.\\pipe', APP_NAME, 'server.sock');
  }

  // 1. Try XDG_RUNTIME_DIR (Linux standard, sometimes macOS)
  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, APP_NAME, 'server.sock');
  }

  // 2. macOS/Unix Fallback: Use /tmp/
  // We use /tmp/ because it is much shorter than ~/Library/Application Support/
  // and keeps us well under the 104-character limit.
  return path.join('/tmp', `${APP_NAME}-${uid}.sock`);
}

export function getRuntimeHome(): string {
  const platform = os.platform();
  const uid = os.userInfo().uid;

  // 1. Check for the modern Unix standard
  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, APP_NAME);
  }

  // 2. Fallback for macOS and older Linux
  if (platform === 'darwin' || platform === 'linux') {
    // /tmp is cleared on boot, making it perfect for PIDs
    return path.join('/tmp', `${APP_NAME}-${uid}`);
  }

  // 3. Windows Fallback
  return path.join(os.tmpdir(), APP_NAME);
}

export const IS_WINDOWS = os.platform() === 'win32';

export function handlePidFile() {
  const runtimeDir = getRuntimeHome();
  const pidPath = path.join(runtimeDir, 'daemon.pid');

  if (fs.existsSync(pidPath)) {
    const oldPid = parseInt(fs.readFileSync(pidPath, 'utf8'), 10);
    try {
      // Sending signal 0 checks if the process is still alive without killing it
      process.kill(oldPid, 0);
      console.error('Daemon is already running!');
      process.exit(1);
    } catch {
      // Process is dead, we can safely overwrite the PID file
      fs.unlinkSync(pidPath);
    }
  }

  fs.mkdirSync(path.dirname(pidPath), {
    recursive: true,
  });
  fs.writeFileSync(pidPath, process.pid.toString());
  return pidPath;
}
