/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

const SERVER_PATH = path.resolve('build/src/main.js');
const WATCHDOG_START_PATTERN = /Watchdog started[\s\S]*?"pid":\s*(\d+)/;
const SHUTDOWN_PATTERN = /server_shutdown/;
const PARENT_DEATH_PATTERN = /Parent death detected/;

interface TestContext {
  logFile: string;
  process?: ChildProcess;
  watchdogPid?: number;
}

async function waitForLogPattern(
  logFile: string,
  pattern: RegExp,
  timeoutMs = 10000,
): Promise<RegExpMatchArray | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const match = content.match(pattern);
      if (match) {
        return match;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timeout waiting for pattern: ${pattern}`);
}

async function waitForProcessExit(
  pid: number,
  timeoutMs = 10000,
): Promise<void> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      try {
        process.kill(pid, 0);
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // ignore
          }
          reject(new Error(`Timeout waiting for process ${pid} to exit`));
        }
      } catch {
        clearInterval(checkInterval);
        resolve();
      }
    }, 50);
  });
}

function createLogFilePath(testName: string): string {
  return path.join(
    os.tmpdir(),
    `test-mcp-telemetry-${testName}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
  );
}

function cleanupTest(ctx: TestContext): void {
  if (ctx.process && ctx.process.exitCode === null) {
    try {
      ctx.process.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
  if (ctx.watchdogPid) {
    try {
      process.kill(ctx.watchdogPid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
  if (ctx.logFile && fs.existsSync(ctx.logFile)) {
    try {
      fs.unlinkSync(ctx.logFile);
    } catch {
      // ignore
    }
  }
}

describe('Telemetry E2E', () => {
  async function runSignalTest(signal: NodeJS.Signals): Promise<void> {
    const ctx: TestContext = {
      logFile: createLogFilePath(signal),
    };

    try {
      ctx.process = spawn(
        process.execPath,
        [
          SERVER_PATH,
          `--log-file=${ctx.logFile}`,
          '--usage-statistics',
          '--headless',
        ],
        {stdio: ['pipe', 'pipe', 'pipe']},
      );

      const match = await waitForLogPattern(
        ctx.logFile,
        WATCHDOG_START_PATTERN,
      );
      assert.ok(match, 'Watchdog start log not found');
      ctx.watchdogPid = parseInt(match[1], 10);
      assert.ok(ctx.watchdogPid > 0, 'Invalid watchdog PID');

      ctx.process.kill(signal);
      await waitForProcessExit(ctx.watchdogPid);

      const shutdownMatch = await waitForLogPattern(
        ctx.logFile,
        SHUTDOWN_PATTERN,
        2000,
      );
      assert.ok(shutdownMatch, 'server_shutdown not logged');

      const deathMatch = await waitForLogPattern(
        ctx.logFile,
        PARENT_DEATH_PATTERN,
        2000,
      );
      assert.ok(deathMatch, 'Parent death not detected');
    } finally {
      cleanupTest(ctx);
    }
  }

  it('handles SIGKILL', () => runSignalTest('SIGKILL'));
  it('handles SIGTERM', () => runSignalTest('SIGTERM'));
});
