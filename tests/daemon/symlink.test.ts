/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import childProcess, {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {sendCommand, startDaemon} from '../../src/daemon/client.js';
import {
  DAEMON_SCRIPT_PATH,
  assertSecureSocketPath,
  getDaemonPid,
  getPidFilePath,
  getSocketPath,
  IS_WINDOWS,
  isDaemonRunning,
} from '../../src/daemon/utils.js';
import {createTempDir} from '../utils.js';

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

  it('startDaemon should reject a symlinked runtime directory before unlinking a stale PID file', async () => {
    if (IS_WINDOWS) {
      return;
    }
    const pidFilePath = getPidFilePath(sessionId);
    const pidDir = path.dirname(pidFilePath);
    const targetDir = path.join(
      path.dirname(pidDir),
      `chrome-devtools-mcp-client-symlink-target-${sessionId}`,
    );
    const targetPidFile = path.join(targetDir, 'daemon.pid');

    try {
      fs.mkdirSync(targetDir, {recursive: true, mode: 0o700});
      fs.writeFileSync(targetPidFile, 'original content', 'utf-8');
      fs.symlinkSync(targetDir, pidDir);

      await assert.rejects(startDaemon([], sessionId), /symbolic link/);
      assert.strictEqual(
        fs.readFileSync(targetPidFile, 'utf-8'),
        'original content',
      );
    } finally {
      try {
        fs.unlinkSync(pidDir);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(targetPidFile);
      } catch {
        // ignore
      }
      try {
        fs.rmdirSync(targetDir);
      } catch {
        // ignore
      }
    }
  });

  it('should reject a symlinked runtime directory', async () => {
    if (IS_WINDOWS) {
      return;
    }
    const pidFilePath = getPidFilePath(sessionId);
    const pidDir = path.dirname(pidFilePath);
    const targetDir = path.join(
      path.dirname(pidDir),
      `chrome-devtools-mcp-symlink-target-${sessionId}`,
    );
    const targetPidFile = path.join(targetDir, 'daemon.pid');

    try {
      fs.mkdirSync(targetDir, {recursive: true, mode: 0o700});
      fs.writeFileSync(targetPidFile, 'original content', 'utf-8');
      fs.symlinkSync(targetDir, pidDir);

      const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH], {
        env: {
          ...process.env,
          CHROME_DEVTOOLS_MCP_SESSION_ID: sessionId,
        },
      });

      const exitCode = await new Promise<number | null>(resolve => {
        child.on('exit', code => {
          resolve(code);
        });
      });

      assert.strictEqual(exitCode, 1);
      assert.strictEqual(
        fs.readFileSync(targetPidFile, 'utf-8'),
        'original content',
      );
    } finally {
      try {
        fs.unlinkSync(pidDir);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(targetPidFile);
      } catch {
        // ignore
      }
      try {
        fs.rmdirSync(targetDir);
      } catch {
        // ignore
      }
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

  describe('CLI client validation', () => {
    it(
      'getDaemonPid rejects a symlinked runtime directory',
      {skip: IS_WINDOWS},
      () => {
        using dir = createTempDir('cdm-sec-dir-symlink-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        const targetDir = path.join(dir.path, 'target');
        fs.mkdirSync(targetDir, {mode: 0o700});
        fs.writeFileSync(path.join(targetDir, 'daemon.pid'), '12345', {
          mode: 0o600,
        });
        fs.symlinkSync(targetDir, pidDir);

        assert.throws(
          () => getDaemonPid(sessionId),
          /must not be a symbolic link/,
        );
      },
    );

    it(
      'getDaemonPid rejects a runtime directory owned by another user',
      {skip: IS_WINDOWS},
      () => {
        using dir = createTempDir('cdm-sec-dir-uid-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, '12345', {mode: 0o600});

        const foreignDirStats = sinon.createStubInstance(fs.Stats);
        foreignDirStats.isSymbolicLink.returns(false);
        foreignDirStats.isDirectory.returns(true);
        foreignDirStats.uid = os.userInfo().uid + 1;
        foreignDirStats.mode = 0o40700;
        sinon
          .stub(fs, 'lstatSync')
          .callThrough()
          .withArgs(pidDir)
          .returns(foreignDirStats);

        assert.throws(
          () => getDaemonPid(sessionId),
          /not owned by the current user/,
        );
      },
    );

    it(
      'getDaemonPid rejects a group or world-accessible runtime directory',
      {skip: IS_WINDOWS},
      () => {
        using dir = createTempDir('cdm-sec-dir-mode-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, '12345', {mode: 0o600});

        try {
          fs.chmodSync(pidDir, 0o777);
          assert.throws(() => getDaemonPid(sessionId), /insecure permissions/);
          fs.chmodSync(pidDir, 0o755);
          assert.throws(() => getDaemonPid(sessionId), /insecure permissions/);
        } finally {
          fs.chmodSync(pidDir, 0o700);
        }
      },
    );

    it('getDaemonPid rejects a symlinked PID file', {skip: IS_WINDOWS}, () => {
      using dir = createTempDir('cdm-sec-pid-symlink-');
      sinon
        .stub(process, 'env')
        .value({...process.env, XDG_RUNTIME_DIR: dir.path});
      const pidFilePath = getPidFilePath(sessionId);
      const pidDir = path.dirname(pidFilePath);
      fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
      const targetFile = path.join(dir.path, 'target.pid');
      fs.writeFileSync(targetFile, '12345', {mode: 0o600});
      fs.symlinkSync(targetFile, pidFilePath);

      assert.throws(
        () => getDaemonPid(sessionId),
        /must not be a symbolic link/,
      );
    });

    it(
      'getDaemonPid rejects a PID file owned by another user',
      {skip: IS_WINDOWS},
      () => {
        using dir = createTempDir('cdm-sec-pid-uid-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, '12345', {mode: 0o600});

        const foreignPidStats = sinon.createStubInstance(fs.Stats);
        foreignPidStats.isSymbolicLink.returns(false);
        foreignPidStats.isFile.returns(true);
        foreignPidStats.uid = os.userInfo().uid + 1;
        foreignPidStats.mode = 0o100600;
        sinon
          .stub(fs, 'lstatSync')
          .callThrough()
          .withArgs(pidFilePath)
          .returns(foreignPidStats);

        assert.throws(
          () => getDaemonPid(sessionId),
          /not owned by the current user/,
        );
      },
    );

    it(
      'getDaemonPid rejects a group or world-writable PID file',
      {skip: IS_WINDOWS},
      () => {
        using dir = createTempDir('cdm-sec-pid-mode-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, '12345', {mode: 0o600});
        fs.chmodSync(pidFilePath, 0o666);

        assert.throws(() => getDaemonPid(sessionId), /insecure permissions/);
      },
    );

    it(
      'getDaemonPid rejects a non-regular PID file',
      {skip: IS_WINDOWS},
      () => {
        using dir = createTempDir('cdm-sec-pid-dir-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        fs.mkdirSync(path.dirname(pidFilePath), {recursive: true, mode: 0o700});
        fs.mkdirSync(pidFilePath, {mode: 0o700});

        assert.throws(() => getDaemonPid(sessionId), /not a regular file/);
      },
    );

    it(
      'sendCommand refuses to connect when runtime directory is owned by another user even with EPERM daemon PID',
      {skip: IS_WINDOWS},
      async () => {
        using dir = createTempDir('cdm-sec-spoof-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, '999999991', {mode: 0o600});

        const foreignDirStats = sinon.createStubInstance(fs.Stats);
        foreignDirStats.isSymbolicLink.returns(false);
        foreignDirStats.isDirectory.returns(true);
        foreignDirStats.uid = os.userInfo().uid + 1;
        foreignDirStats.mode = 0o40755;
        sinon
          .stub(fs, 'lstatSync')
          .callThrough()
          .withArgs(pidDir)
          .returns(foreignDirStats);
        sinon
          .stub(process, 'kill')
          .withArgs(999999991, 0)
          .throws(Object.assign(new Error('EPERM'), {code: 'EPERM'}));
        sinon.stub(childProcess, 'execFileSync').returns(DAEMON_SCRIPT_PATH);
        const createConnection = sinon.stub(net, 'createConnection');

        assert.throws(
          () => isDaemonRunning(sessionId),
          /not owned by the current user/,
        );
        await assert.rejects(
          sendCommand({method: 'status'}, sessionId),
          /not owned by the current user/,
        );
        sinon.assert.notCalled(createConnection);
      },
    );

    it(
      'sendCommand rejects a symlinked socket without connecting',
      {skip: IS_WINDOWS},
      async () => {
        using dir = createTempDir('cdm-sec-sock-symlink-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        const socketPath = getSocketPath(sessionId);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, String(process.pid), {mode: 0o600});
        const targetSocket = path.join(dir.path, 'other.sock');
        fs.writeFileSync(targetSocket, '', {mode: 0o600});
        fs.symlinkSync(targetSocket, socketPath);

        sinon
          .stub(fs, 'readFileSync')
          .callThrough()
          .withArgs(`/proc/${process.pid}/cmdline`, 'utf-8')
          .returns(`node\0${DAEMON_SCRIPT_PATH}\0`);
        sinon.stub(childProcess, 'execFileSync').returns(DAEMON_SCRIPT_PATH);
        const createConnection = sinon.stub(net, 'createConnection');

        await assert.rejects(
          sendCommand({method: 'status'}, sessionId),
          /must not be a symbolic link/,
        );
        sinon.assert.notCalled(createConnection);
      },
    );

    it(
      'sendCommand rejects a socket owned by another user without connecting',
      {skip: IS_WINDOWS},
      async () => {
        using dir = createTempDir('cdm-sec-sock-uid-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        const socketPath = getSocketPath(sessionId);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, String(process.pid), {mode: 0o600});

        const foreignSocketStats = sinon.createStubInstance(fs.Stats);
        foreignSocketStats.isSymbolicLink.returns(false);
        foreignSocketStats.isSocket.returns(true);
        foreignSocketStats.uid = os.userInfo().uid + 1;
        foreignSocketStats.mode = 0o140777;
        sinon
          .stub(fs, 'lstatSync')
          .callThrough()
          .withArgs(socketPath)
          .returns(foreignSocketStats);
        sinon
          .stub(fs, 'readFileSync')
          .callThrough()
          .withArgs(`/proc/${process.pid}/cmdline`, 'utf-8')
          .returns(`node\0${DAEMON_SCRIPT_PATH}\0`);
        sinon.stub(childProcess, 'execFileSync').returns(DAEMON_SCRIPT_PATH);
        const createConnection = sinon.stub(net, 'createConnection');

        await assert.rejects(
          sendCommand({method: 'status'}, sessionId),
          /not owned by the current user/,
        );
        sinon.assert.notCalled(createConnection);
      },
    );

    it(
      'sendCommand rejects a non-socket file at the socket path without connecting',
      {skip: IS_WINDOWS},
      async () => {
        using dir = createTempDir('cdm-sec-sock-regular-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const pidFilePath = getPidFilePath(sessionId);
        const pidDir = path.dirname(pidFilePath);
        const socketPath = getSocketPath(sessionId);
        fs.mkdirSync(pidDir, {recursive: true, mode: 0o700});
        fs.writeFileSync(pidFilePath, String(process.pid), {mode: 0o600});
        fs.writeFileSync(socketPath, 'not a socket', {mode: 0o600});

        sinon
          .stub(fs, 'readFileSync')
          .callThrough()
          .withArgs(`/proc/${process.pid}/cmdline`, 'utf-8')
          .returns(`node\0${DAEMON_SCRIPT_PATH}\0`);
        sinon.stub(childProcess, 'execFileSync').returns(DAEMON_SCRIPT_PATH);
        const createConnection = sinon.stub(net, 'createConnection');

        await assert.rejects(
          sendCommand({method: 'status'}, sessionId),
          /not a Unix socket/,
        );
        sinon.assert.notCalled(createConnection);
      },
    );

    it(
      'assertSecureSocketPath allows a user-owned socket with permissive mode inside a 0700 runtime directory',
      {skip: IS_WINDOWS},
      () => {
        using dir = createTempDir('cdm-sec-sock-umask-');
        sinon
          .stub(process, 'env')
          .value({...process.env, XDG_RUNTIME_DIR: dir.path});
        const socketPath = getSocketPath(sessionId);
        fs.mkdirSync(path.dirname(socketPath), {recursive: true, mode: 0o700});

        const socketStats = sinon.createStubInstance(fs.Stats);
        socketStats.isSymbolicLink.returns(false);
        socketStats.isSocket.returns(true);
        socketStats.uid = os.userInfo().uid;
        socketStats.mode = 0o140777;
        sinon
          .stub(fs, 'lstatSync')
          .callThrough()
          .withArgs(socketPath)
          .returns(socketStats);

        assert.doesNotThrow(() => assertSecureSocketPath(socketPath));
      },
    );
  });
});
