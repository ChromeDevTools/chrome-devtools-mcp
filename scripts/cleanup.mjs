#!/usr/bin/env node
/**
 * Bulk cleanup of stale chrome-ai-bridge MCP server processes.
 *
 * Usage: npm run cleanup
 *
 * 1. Lists all chrome-ai-bridge related processes
 * 2. Sends SIGTERM to main.js processes
 * 3. Waits 2 seconds, then SIGKILL survivors
 * 4. Removes stale lock file
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOCK_FILE = path.join(os.homedir(), '.cache', 'chrome-ai-bridge', 'mcp.lock');

function findProcesses(pattern) {
  try {
    const output = execFileSync('pgrep', ['-af', pattern], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return output.trim().split('\n').filter(Boolean).map(line => {
      const spaceIdx = line.indexOf(' ');
      return {
        pid: Number(line.slice(0, spaceIdx)),
        cmd: line.slice(spaceIdx + 1),
      };
    });
  } catch {
    return [];
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('[cleanup] Scanning for chrome-ai-bridge processes...\n');

  // List all related processes
  const allProcs = findProcesses('chrome-ai-bridge');
  if (allProcs.length === 0) {
    console.log('[cleanup] No chrome-ai-bridge processes found.');
    removeLock();
    return;
  }

  console.log(`[cleanup] Found ${allProcs.length} process(es):`);
  for (const p of allProcs) {
    console.log(`  PID ${p.pid}: ${p.cmd}`);
  }
  console.log();

  // Target only main.js processes (cli.mjs wrappers will exit when main.js dies)
  const targets = allProcs
    .filter(p => p.cmd.includes('main.js'))
    .map(p => p.pid)
    .filter(pid => pid !== process.pid);

  if (targets.length === 0) {
    console.log('[cleanup] No main.js processes to kill.');
    removeLock();
    return;
  }

  // SIGTERM
  console.log(`[cleanup] Sending SIGTERM to ${targets.length} process(es): ${targets.join(', ')}`);
  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }

  await sleep(2000);

  // SIGKILL survivors
  let killedCount = 0;
  for (const pid of targets) {
    if (isAlive(pid)) {
      console.log(`[cleanup] PID ${pid} still alive. Sending SIGKILL...`);
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // ignore
      }
    }
    killedCount++;
  }

  removeLock();

  console.log(`\n[cleanup] Done. Terminated ${killedCount} process(es).`);
}

function removeLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
    console.log(`[cleanup] Removed lock file: ${LOCK_FILE}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.log(`[cleanup] Could not remove lock file: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error(`[cleanup] Error: ${err.message}`);
  process.exit(1);
});
