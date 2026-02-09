/**
 * Process lock management for stale MCP process cleanup.
 *
 * Two-layer defense:
 * A. PID file management - detect and kill stale processes on startup
 * B. Orphan watchdog - auto-exit if parent process dies (ppid becomes 1)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {logger} from './logger.js';

interface PidFileData {
  pid: number;
  startedAt: string;
  nonce: string;
}

// Use a fixed path under ~/.cache so it works regardless of cwd
const PID_FILE_DIR = path.join(os.homedir(), '.cache', 'chrome-ai-bridge');
const PID_FILE_PATH = path.join(PID_FILE_DIR, 'mcp.pid');

let currentNonce: string | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

function generateNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readPidFile(): PidFileData | null {
  try {
    const raw = fs.readFileSync(PID_FILE_PATH, 'utf-8');
    const data = JSON.parse(raw) as PidFileData;
    if (typeof data.pid !== 'number' || !data.nonce) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check for stale PID file and kill the old process if it's still running.
 * SIGTERM -> wait 2s -> SIGKILL if still alive.
 */
export async function cleanupStaleProcess(): Promise<void> {
  const pidData = readPidFile();
  if (!pidData) {
    return;
  }

  // Don't kill ourselves
  if (pidData.pid === process.pid) {
    return;
  }

  if (!isProcessAlive(pidData.pid)) {
    logger(`[process-lock] Stale PID file found (pid=${pidData.pid}, not running). Removing.`);
    try {
      fs.unlinkSync(PID_FILE_PATH);
    } catch {
      // ignore
    }
    return;
  }

  logger(`[process-lock] Stale process detected (pid=${pidData.pid}, started=${pidData.startedAt}). Sending SIGTERM...`);

  try {
    process.kill(pidData.pid, 'SIGTERM');
  } catch {
    // Process already gone
    return;
  }

  // Wait up to 2 seconds for graceful shutdown
  await sleep(2000);

  if (isProcessAlive(pidData.pid)) {
    logger(`[process-lock] Process ${pidData.pid} still alive after SIGTERM. Sending SIGKILL...`);
    try {
      process.kill(pidData.pid, 'SIGKILL');
    } catch {
      // ignore
    }
    await sleep(500);
  }

  logger(`[process-lock] Stale process cleanup complete.`);
  try {
    fs.unlinkSync(PID_FILE_PATH);
  } catch {
    // ignore
  }
}

/**
 * Write current process PID file with nonce for safe removal.
 */
export function writePidFile(): void {
  currentNonce = generateNonce();
  const data: PidFileData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    nonce: currentNonce,
  };

  try {
    fs.mkdirSync(PID_FILE_DIR, {recursive: true});
    fs.writeFileSync(PID_FILE_PATH, JSON.stringify(data, null, 2) + '\n');
    logger(`[process-lock] PID file written (pid=${process.pid})`);
  } catch (error) {
    logger(`[process-lock] Failed to write PID file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Remove PID file only if it belongs to the current process (matching nonce).
 */
export function removePidFile(): void {
  if (!currentNonce) return;

  try {
    const pidData = readPidFile();
    if (pidData && pidData.nonce === currentNonce) {
      fs.unlinkSync(PID_FILE_PATH);
      logger(`[process-lock] PID file removed.`);
    }
  } catch {
    // ignore - file may already be deleted
  }
  currentNonce = null;
}

/**
 * Install orphan watchdog: monitor ppid every 2 seconds.
 * If parent dies (ppid becomes 1 on Unix), call the shutdown callback.
 */
export function installOrphanWatchdog(onOrphaned: () => void): void {
  const initialPpid = process.ppid;

  watchdogTimer = setInterval(() => {
    if (process.ppid !== initialPpid) {
      logger(`[process-lock] Parent process changed (${initialPpid} -> ${process.ppid}). Orphaned.`);
      stopOrphanWatchdog();
      onOrphaned();
    }
  }, 2000);

  // Don't keep the process alive just for the watchdog
  watchdogTimer.unref();
}

/**
 * Stop the orphan watchdog timer.
 */
export function stopOrphanWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}
