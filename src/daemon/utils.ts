/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {logger} from '../logger.js';
import type {YargsOptions} from '../third_party/index.js';

export const DAEMON_SCRIPT_PATH = path.join(import.meta.dirname, 'daemon.js');
export const INDEX_SCRIPT_PATH = path.join(
  import.meta.dirname,
  '..',
  'bin',
  'chrome-devtools-mcp.js',
);

const APP_NAME = 'chrome-devtools-mcp';
export const DAEMON_CLIENT_NAME = 'chrome-devtools-cli-daemon';

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

export function getPidFilePath() {
  const runtimeDir = getRuntimeHome();
  return path.join(runtimeDir, 'daemon.pid');
}

export function getDaemonPid() {
  try {
    const pidFile = getPidFilePath();
    logger(`Daemon pid file ${pidFile}`);
    if (!fs.existsSync(pidFile)) {
      return null;
    }
    const pidContent = fs.readFileSync(pidFile, 'utf-8');
    const pid = parseInt(pidContent.trim(), 10);
    logger(`Daemon pid: ${pid}`);
    if (isNaN(pid)) {
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

export function isDaemonRunning(pid = getDaemonPid()): pid is number {
  if (pid) {
    try {
      process.kill(pid, 0); // Throws if process doesn't exist
      return true;
    } catch {
      // Process is dead, stale PID file. Proceed with startup.
    }
  }
  return false;
}

export function serializeArgs(
  options: Record<string, YargsOptions>,
  argv: Record<string, unknown>,
): string[] {
  const args: string[] = [];
  for (const key of Object.keys(options)) {
    if (argv[key] === undefined || argv[key] === null) {
      continue;
    }
    const value = argv[key];
    const kebabKey = key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

    if (typeof value === 'boolean') {
      if (value) {
        args.push(`--${kebabKey}`);
      } else {
        args.push(`--no-${kebabKey}`);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        args.push(`--${kebabKey}`, String(item));
      }
    } else {
      args.push(`--${kebabKey}`, String(value));
    }
  }
  return args;
}
