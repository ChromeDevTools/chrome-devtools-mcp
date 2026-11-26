/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type {YargsOptions} from '../third_party/index.js';
import {logger} from '../utils/logger.js';

export const DAEMON_SCRIPT_PATH: string = path.join(
  import.meta.dirname,
  'daemon.js',
);

const APP_NAME = 'chrome-devtools-mcp';
export const DAEMON_CLIENT_NAME = 'chrome-devtools-cli-daemon';

export function assertValidSessionId(sessionId: string): void {
  if (!sessionId) {
    return;
  }
  if (!/^[a-fA-F0-9-]+$/.test(sessionId)) {
    throw new Error(`Invalid sessionId: ${sessionId}`);
  }
}

// Using these paths due to strict limits on the POSIX socket path length.
export function getSocketPath(sessionId: string): string {
  assertValidSessionId(sessionId);
  const username = os.userInfo().username;
  const suffix = sessionId ? `-${sessionId}` : '';
  const appName = APP_NAME + suffix;

  if (IS_WINDOWS) {
    // Windows uses Named Pipes, not file paths.
    // This format is required for server.listen()
    // Append username to prevent cross-user named pipe squatting
    return path.join('\\\\.\\pipe', `${appName}-${username}`, 'server.sock');
  }

  return path.join(getRuntimeHome(sessionId), 'server.sock');
}

export function getRuntimeHome(sessionId: string): string {
  assertValidSessionId(sessionId);
  const platform = os.platform();
  const uid = os.userInfo().uid;
  const suffix = sessionId ? `-${sessionId}` : '';
  const appName = APP_NAME + suffix;

  // 1. Check for the modern Unix standard
  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, appName);
  }

  // 2. Fallback for macOS and older Linux
  if (platform === 'darwin' || platform === 'linux') {
    // /tmp is cleared on boot, making it perfect for PIDs
    return path.join('/tmp', `${appName}-${uid}`);
  }

  // 3. Windows Fallback
  return path.join(os.tmpdir(), appName);
}

export const IS_WINDOWS: boolean = os.platform() === 'win32';

export function getPidFilePath(sessionId: string): string {
  assertValidSessionId(sessionId);
  const runtimeDir = getRuntimeHome(sessionId);
  return path.join(runtimeDir, 'daemon.pid');
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

interface SecurePathOptions {
  label: string;
  filePath: string;
  stats: fs.Stats;
  expectedType: 'directory' | 'file' | 'socket';
  forbiddenModeMask?: number;
}

function assertSecurePathStats({
  label,
  filePath,
  stats,
  expectedType,
  forbiddenModeMask = 0,
}: SecurePathOptions): void {
  const currentUserUid = os.userInfo().uid;

  if (stats.isSymbolicLink()) {
    throw new Error(
      `${label} ${filePath} must not be a symbolic link. Possible tampering.`,
    );
  }
  if (expectedType === 'directory' && !stats.isDirectory()) {
    throw new Error(
      `${label} ${filePath} is not a directory. Possible tampering.`,
    );
  }
  if (expectedType === 'file' && !stats.isFile()) {
    throw new Error(
      `${label} ${filePath} is not a regular file. Possible tampering.`,
    );
  }
  if (expectedType === 'socket' && !stats.isSocket()) {
    throw new Error(
      `${label} ${filePath} is not a Unix socket. Possible tampering.`,
    );
  }
  if (stats.uid !== currentUserUid) {
    throw new Error(
      `${label} ${filePath} is not owned by the current user (Expected: ${currentUserUid}, Found: ${stats.uid}). Possible tampering.`,
    );
  }
  if (forbiddenModeMask && (stats.mode & forbiddenModeMask) !== 0) {
    const restriction =
      expectedType === 'directory' ? 'accessible' : 'writable';
    throw new Error(
      `${label} ${filePath} has insecure permissions (Mode: ${stats.mode.toString(8)}). It should not be ${restriction} by group or others.`,
    );
  }
}

export function assertSecureRuntimeDir(dirPath: string): void {
  if (IS_WINDOWS) {
    return;
  }
  assertSecurePathStats({
    label: 'Runtime directory',
    filePath: dirPath,
    stats: fs.lstatSync(dirPath),
    expectedType: 'directory',
    forbiddenModeMask: 0o077,
  });
}

export function assertSecureSocketPath(socketPath: string): void {
  if (IS_WINDOWS) {
    return;
  }
  assertSecureRuntimeDir(path.dirname(socketPath));
  assertSecurePathStats({
    label: 'Daemon socket',
    filePath: socketPath,
    stats: fs.lstatSync(socketPath),
    expectedType: 'socket',
  });
}

function readPidFile(pidFile: string): string | null {
  if (IS_WINDOWS) {
    try {
      return fs.readFileSync(pidFile, 'utf-8');
    } catch (error) {
      if (isEnoent(error)) {
        return null;
      }
      throw error;
    }
  }

  try {
    assertSecureRuntimeDir(path.dirname(pidFile));
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }

  let lstats: fs.Stats;
  try {
    lstats = fs.lstatSync(pidFile);
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
  const pidForbiddenModeMask = fs.constants.S_IWGRP | fs.constants.S_IWOTH;
  assertSecurePathStats({
    label: 'Daemon PID file',
    filePath: pidFile,
    stats: lstats,
    expectedType: 'file',
    forbiddenModeMask: pidForbiddenModeMask,
  });

  let fd = -1;
  try {
    fd = fs.openSync(pidFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    assertSecurePathStats({
      label: 'Daemon PID file',
      filePath: pidFile,
      stats: fs.fstatSync(fd),
      expectedType: 'file',
      forbiddenModeMask: pidForbiddenModeMask,
    });
    return fs.readFileSync(fd, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  } finally {
    if (fd !== -1) {
      fs.closeSync(fd);
    }
  }
}

export function getDaemonPid(sessionId: string): number | null {
  assertValidSessionId(sessionId);
  const pidFile = getPidFilePath(sessionId);
  logger?.(`Daemon pid file ${pidFile} sessionId=${sessionId}`);
  const pidContent = readPidFile(pidFile);
  if (pidContent === null) {
    return null;
  }
  const pid = parseInt(pidContent.trim(), 10);
  logger?.(`Daemon pid: ${pid}`);
  if (isNaN(pid)) {
    return null;
  }
  return pid;
}

const verifiedDaemonPids = new Map<number, boolean>();

function getProcessCommandLine(pid: number): string {
  if (process.platform === 'linux' && fs.existsSync('/proc')) {
    return fs
      .readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
      .replaceAll('\0', ' ');
  }
  if (IS_WINDOWS) {
    return childProcess.execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
      ],
      {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      },
    );
  }
  return childProcess.execFileSync(
    'ps',
    ['-p', String(pid), '-o', 'command='],
    {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
}

function isDaemonProcess(pid: number): boolean {
  const cached = verifiedDaemonPids.get(pid);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const commandLine = getProcessCommandLine(pid).trim();
    const isDaemon =
      commandLine === '' || /[\\/]daemon[\\/]daemon\.js/.test(commandLine);
    verifiedDaemonPids.set(pid, isDaemon);
    return isDaemon;
  } catch {
    verifiedDaemonPids.set(pid, true);
    return true;
  }
}

export function isDaemonRunning(sessionId: string): boolean {
  assertValidSessionId(sessionId);
  const pid = getDaemonPid(sessionId);
  if (pid) {
    try {
      process.kill(pid, 0);
      return isDaemonProcess(pid);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EPERM') {
        return isDaemonProcess(pid);
      }
      // Process is dead, stale PID file. Proceed with startup.
      verifiedDaemonPids.delete(pid);
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
    const option = options[key];
    // Yargs reuses the option `default` object; skip it so the daemon parser
    // still sees the original default (needed for filesystemRoot identity).
    if (option !== undefined && value === option.default) {
      continue;
    }
    const kebabKey = key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

    if (typeof value === 'boolean') {
      if (value) {
        args.push(`--${kebabKey}`);
      } else {
        args.push(`--no-${kebabKey}`);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        args.push(`--${kebabKey}=${String(item)}`);
      }
    } else {
      const serializedValue =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      args.push(`--${kebabKey}=${serializedValue}`);
    }
  }
  return args;
}
