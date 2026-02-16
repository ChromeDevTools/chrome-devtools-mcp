/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';

import {DAEMON_SCRIPT_PATH, getDaemonPaths} from './daemonUtils.js';

export async function isDaemonRunning() {
  try {
    const {pidFile} = await getDaemonPaths();
    const pidContent = await fs.readFile(pidFile, 'utf-8');
    const pid = parseInt(pidContent.trim(), 10);

    if (isNaN(pid)) {
      return false;
    }
    // Check if process is still running (signal 0 doesn't kill, just checks)
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      // Process doesn't exist
      return false;
    }
  } catch {
    // PID file doesn't exist or can't be read
    return false;
  }
}

export async function startDaemon(mcpArgs: string[] = []) {
  if (await isDaemonRunning()) {
    console.log('Daemon is already running');
    return;
  }
  console.log('Starting daemon...');

  // Spawn daemon server process
  const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH, ...mcpArgs], {
    detached: true,
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  child.unref();

  // Wait a bit for the process to start and write PID
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify PID file was created
  try {
    const {pidFile} = await getDaemonPaths();
    const pidContent = await fs.readFile(pidFile, 'utf-8');
    const pid = parseInt(pidContent.trim(), 10);
    if (pid === child.pid) {
      console.log(`Daemon started with PID ${pid}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not verify daemon PID file:', errorMessage);
  }
}

export async function stopDaemon() {
  if (!(await isDaemonRunning())) {
    console.log('Daemon is not running');
    return;
  }
  try {
    const {pidFile, socketPath} = await getDaemonPaths();
    const pidContent = await fs.readFile(pidFile, 'utf-8');
    const pid = parseInt(pidContent.trim(), 10);

    if (isNaN(pid)) {
      console.log('Invalid PID file');
      await fs.unlink(pidFile).catch(() => undefined);
      return;
    }

    // Try graceful shutdown first
    try {
      process.kill(pid, 'SIGTERM');

      // Wait for process to exit
      let attempts = 0;
      while (attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
          process.kill(pid, 0);
          attempts++;
        } catch {
          // Process has exited
          break;
        }
      }

      // If still running, force kill
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    } catch {
      // Process might already be dead
    }

    // Clean up files
    await fs.unlink(pidFile).catch(() => undefined);
    if (os.platform() !== 'win32') {
      await fs.unlink(socketPath).catch(() => undefined);
    }

    console.log('Daemon stopped');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error stopping daemon:', errorMessage);
    // Try to clean up anyway
    try {
      const {pidFile, socketPath} = await getDaemonPaths();
      await fs.unlink(pidFile).catch(() => undefined);
      if (os.platform() !== 'win32') {
        await fs.unlink(socketPath).catch(() => undefined);
      }
    } catch {
      // Ignore errors during cleanup of cleanup
    }
  }
}

export async function getSocketPath() {
  const {socketPath} = await getDaemonPaths();
  return socketPath;
}
