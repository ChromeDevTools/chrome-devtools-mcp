/**
 * Process lock management using exclusive file lock.
 *
 * Uses fs.openSync(path, 'wx') for atomic exclusive lock acquisition.
 * Kill is only performed when a stale process is confirmed alive.
 * Orphan watchdog is removed - stdin EOF (main.ts:266-267) handles this.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {logger} from './logger.js';

const LOCK_DIR = path.join(os.homedir(), '.cache', 'chrome-ai-bridge');
const LOCK_FILE = path.join(LOCK_DIR, 'mcp.lock');

let lockFd: number | null = null;

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

function readPidFromLock(): number | null {
  try {
    const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    const pid = Number(content);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Try to create lock file exclusively (wx flag).
 * Returns the file descriptor on success, null on EEXIST.
 * Throws on other errors.
 */
function tryCreateLock(): number | null {
  try {
    fs.mkdirSync(LOCK_DIR, {recursive: true});
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(fd, String(process.pid));
    return fd;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
      return null;
    }
    throw error;
  }
}

/**
 * Handle an existing lock file: check if the holder is alive and deal with it.
 * Returns true if the stale lock was removed and retry is possible.
 */
async function handleExistingLock(): Promise<boolean> {
  const pid = readPidFromLock();

  if (pid === null) {
    // Corrupted or empty lock file - remove it
    logger('[process-lock] Corrupted lock file found. Removing.');
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return true;
  }

  // Don't kill ourselves
  if (pid === process.pid) {
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return true;
  }

  if (!isProcessAlive(pid)) {
    // Dead process - stale lock
    logger(`[process-lock] Stale lock (pid=${pid}, not running). Removing.`);
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return true;
  }

  // Process is alive - send SIGTERM and wait
  logger(`[process-lock] Existing process detected (pid=${pid}). Sending SIGTERM...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process disappeared between check and kill
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return true;
  }

  await sleep(2000);

  if (isProcessAlive(pid)) {
    logger(`[process-lock] Process ${pid} still alive. Sending SIGKILL...`);
    try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
    await sleep(500);
  }

  logger('[process-lock] Previous process terminated.');
  try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
  return true;
}

/**
 * Acquire an exclusive process lock. Call once at startup.
 *
 * Flow:
 * 1. Try fs.openSync(LOCK_FILE, 'wx') for atomic exclusive creation
 * 2. Success -> write PID, hold FD
 * 3. EEXIST -> check holder, kill only if alive, retry once
 */
export async function acquireLock(): Promise<void> {
  // First attempt
  const fd = tryCreateLock();
  if (fd !== null) {
    lockFd = fd;
    logger(`[process-lock] Lock acquired (pid=${process.pid})`);
    return;
  }

  // Lock file exists - handle the existing holder
  const canRetry = await handleExistingLock();
  if (!canRetry) {
    throw new Error('[process-lock] Failed to acquire lock');
  }

  // Retry once
  const fd2 = tryCreateLock();
  if (fd2 !== null) {
    lockFd = fd2;
    logger(`[process-lock] Lock acquired after cleanup (pid=${process.pid})`);
    return;
  }

  throw new Error('[process-lock] Failed to acquire lock after retry');
}

/**
 * Release the process lock. Call during shutdown.
 */
export function releaseLock(): void {
  if (lockFd !== null) {
    try { fs.closeSync(lockFd); } catch { /* ignore */ }
    lockFd = null;
  }
  try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
  logger('[process-lock] Lock released.');
}

/**
 * Kill all sibling chrome-ai-bridge processes (bulk cleanup).
 *
 * Uses pgrep to find processes matching 'chrome-ai-bridge/build/src/main.js',
 * excludes self and parent, then SIGTERM -> wait -> SIGKILL survivors.
 *
 * Returns the number of processes killed.
 * On pgrep failure (e.g. not installed), returns 0 silently.
 */
export async function killSiblings(): Promise<number> {
  let pids: number[];
  try {
    const output = execFileSync('pgrep', ['-f', 'chrome-ai-bridge/build/src/main.js'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    pids = output.trim().split('\n')
      .map(s => Number(s.trim()))
      .filter(n => Number.isFinite(n) && n > 0);
  } catch {
    // pgrep returns exit code 1 when no matches, or not available
    return 0;
  }

  // Exclude self and parent (cli.mjs wrapper)
  const selfPid = process.pid;
  const parentPid = process.ppid;
  const targets = pids.filter(pid => pid !== selfPid && pid !== parentPid);

  if (targets.length === 0) {
    return 0;
  }

  logger(`[process-lock] Found ${targets.length} stale sibling(s): ${targets.join(', ')}`);

  // Send SIGTERM to all
  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process already gone
    }
  }

  // Wait for graceful shutdown
  await sleep(2000);

  // SIGKILL survivors
  let killed = 0;
  for (const pid of targets) {
    if (isProcessAlive(pid)) {
      logger(`[process-lock] Process ${pid} still alive after SIGTERM. Sending SIGKILL...`);
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // ignore
      }
    }
    killed++;
  }

  return killed;
}
