/**
 * Process lock management using exclusive file lock.
 *
 * Lock file stores JSON: {pid, port, startedAt}
 * Multi-client mode: alive processes are NOT killed — Secondary
 * instances connect to the Primary via HTTP proxy instead.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {logger} from './logger.js';

const LOCK_DIR = path.join(os.homedir(), '.cache', 'chrome-ai-bridge');
const LOCK_FILE = path.join(LOCK_DIR, 'mcp.lock');

let lockFd: number | null = null;

export interface LockInfo {
  pid: number;
  port: number;
  startedAt: string; // ISO 8601
}

export interface PrimaryStatus {
  alive: boolean;
  port: number;
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
 * Read lock file content. Supports both JSON (new) and plain PID (legacy).
 */
function readLockInfo(): LockInfo | null {
  try {
    const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    if (!content) return null;

    // Try JSON format first
    if (content.startsWith('{')) {
      const parsed = JSON.parse(content) as Partial<LockInfo>;
      if (parsed.pid && parsed.pid > 0) {
        return {
          pid: parsed.pid,
          port: parsed.port ?? 0,
          startedAt: parsed.startedAt ?? '',
        };
      }
      return null;
    }

    // Legacy: plain PID number
    const pid = Number(content);
    if (Number.isFinite(pid) && pid > 0) {
      return {pid, port: 0, startedAt: ''};
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if an existing Primary is alive and reachable.
 * Reads the lock file and checks process liveness.
 */
export function checkExistingPrimary(): PrimaryStatus | null {
  const info = readLockInfo();
  if (!info) return null;

  if (!isProcessAlive(info.pid)) {
    logger(`[process-lock] Stale lock (pid=${info.pid}, not running).`);
    return null;
  }

  return {alive: true, port: info.port};
}

/**
 * Try to create lock file exclusively (wx flag).
 * Writes JSON {pid, port, startedAt}.
 * Returns the file descriptor on success, null on EEXIST.
 */
function tryCreateLock(port: number): number | null {
  try {
    fs.mkdirSync(LOCK_DIR, {recursive: true});
    const fd = fs.openSync(LOCK_FILE, 'wx');
    const lockInfo: LockInfo = {
      pid: process.pid,
      port,
      startedAt: new Date().toISOString(),
    };
    fs.writeSync(fd, JSON.stringify(lockInfo));
    return fd;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
      return null;
    }
    throw error;
  }
}

/**
 * Handle an existing lock file.
 * In multi-client mode, alive processes are NOT killed.
 * Only stale (dead process) locks are removed.
 * Returns true if the stale lock was removed and retry is possible.
 * Returns false if the lock holder is alive (should enter proxy mode).
 */
async function handleExistingLock(): Promise<boolean> {
  const info = readLockInfo();

  if (info === null) {
    logger('[process-lock] Corrupted lock file found. Removing.');
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return true;
  }

  // Don't conflict with ourselves
  if (info.pid === process.pid) {
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return true;
  }

  if (!isProcessAlive(info.pid)) {
    logger(`[process-lock] Stale lock (pid=${info.pid}, not running). Removing.`);
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return true;
  }

  // Process is alive — do NOT kill. Caller should enter proxy mode.
  logger(`[process-lock] Primary is alive (pid=${info.pid}, port=${info.port}). Cannot acquire lock.`);
  return false;
}

/**
 * Acquire an exclusive process lock. Call once at startup for Primary mode.
 *
 * Flow:
 * 1. Try fs.openSync(LOCK_FILE, 'wx') for atomic exclusive creation
 * 2. Success -> write JSON {pid, port, startedAt}, hold FD
 * 3. EEXIST -> check holder; remove only if stale, retry once
 * 4. If holder is alive -> throw (caller should enter proxy mode)
 */
export async function acquireLock(port: number): Promise<void> {
  const fd = tryCreateLock(port);
  if (fd !== null) {
    lockFd = fd;
    logger(`[process-lock] Lock acquired (pid=${process.pid}, port=${port})`);
    return;
  }

  // Lock file exists - handle the existing holder
  const canRetry = await handleExistingLock();
  if (!canRetry) {
    throw new Error('[process-lock] Primary is alive. Use proxy mode.');
  }

  // Retry once after stale removal
  const fd2 = tryCreateLock(port);
  if (fd2 !== null) {
    lockFd = fd2;
    logger(`[process-lock] Lock acquired after cleanup (pid=${process.pid}, port=${port})`);
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
