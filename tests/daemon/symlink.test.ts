/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {
  DAEMON_SCRIPT_PATH,
  getPidFilePath,
  IS_WINDOWS,
} from '../../src/daemon/utils.js';

describe('daemon security checks', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = crypto.randomUUID();
  });

  afterEach(() => {
    const pidFilePath = getPidFilePath(sessionId);
    const pidDir = path.dirname(pidFilePath);
    try {
      fs.unlinkSync(pidFilePath);
    } catch {
      // ignore
    }
    try {
      fs.rmdirSync(pidDir);
    } catch {
      // ignore
    }
  });

  it('should not follow symlinks and fail to write PID file', async () => {
    if (IS_WINDOWS) {
      return;
    }
    const pidFilePath = getPidFilePath(sessionId);
    const pidDir = path.dirname(pidFilePath);

    // Ensure directory exists with safe permissions
    fs.mkdirSync(pidDir, {recursive: true});
    fs.chmodSync(pidDir, 0o700);

    // Create a target file that we do NOT want to be overwritten
    const targetPath = path.join(pidDir, 'target_file.txt');
    fs.writeFileSync(targetPath, 'original content', 'utf-8');

    // Create a symlink at pidFilePath pointing to targetPath
    fs.symlinkSync(targetPath, pidFilePath);

    // Try to spawn the daemon
    const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH], {
      env: {...process.env, CHROME_DEVTOOLS_MCP_SESSION_ID: sessionId},
    });

    const exitCode = await new Promise<number | null>(resolve => {
      child.on('exit', code => {
        resolve(code);
      });
    });

    // Daemon should have exited with error code 1
    assert.strictEqual(exitCode, 1);

    // Target file content should remain unchanged ("original content")
    const content = fs.readFileSync(targetPath, 'utf-8');
    assert.strictEqual(content, 'original content');

    // Clean up target file and symlink
    try {
      fs.unlinkSync(pidFilePath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(targetPath);
    } catch {
      // ignore
    }
  });

  it('should fail if directory has insecure permissions (group/world writable)', async () => {
    if (IS_WINDOWS) {
      return;
    }
    const pidFilePath = getPidFilePath(sessionId);
    const pidDir = path.dirname(pidFilePath);

    // Ensure directory exists
    fs.mkdirSync(pidDir, {recursive: true});

    // Change permissions to 0o777 (group and world writable)
    fs.chmodSync(pidDir, 0o777);

    // Try to spawn the daemon
    const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH], {
      env: {...process.env, CHROME_DEVTOOLS_MCP_SESSION_ID: sessionId},
    });

    const exitCode = await new Promise<number | null>(resolve => {
      child.on('exit', code => {
        resolve(code);
      });
    });

    // Daemon should have exited with error code 1
    assert.strictEqual(exitCode, 1);

    // Restore permissions so cleanup can run successfully
    try {
      fs.chmodSync(pidDir, 0o700);
    } catch {
      // ignore
    }
  });
});
