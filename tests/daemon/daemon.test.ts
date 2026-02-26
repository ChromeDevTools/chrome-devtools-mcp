/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {describe, it} from 'node:test';

import {getSocketPath} from '../../src/daemon/utils.js';

const DAEMON_SCRIPT = path.join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'daemon',
  'daemon.js',
);

describe('Daemon', () => {
  it('should terminate chrome instance when transport is closed', async () => {
    const daemonProcess = spawn(process.execPath, [DAEMON_SCRIPT], {
      env: {
        ...process.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const socketPath = getSocketPath();
    // Wait for daemon to be ready
    await new Promise<void>((resolve, reject) => {
      const onData = (data: Buffer) => {
        const output = data.toString();
        // Wait for MCP client to connect
        if (output.includes('MCP client connected')) {
          daemonProcess.stdout.off('data', onData);
          resolve();
        }
      };
      daemonProcess.stdout.on('data', onData);
      daemonProcess.stderr.on('data', data => {
        console.log('err', data.toString('utf8'));
      });
      daemonProcess.on('error', reject);
      daemonProcess.on('exit', (code: number) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Daemon exited with code ${code}`));
        }
      });
    });

    const socket = net.createConnection(socketPath);
    await new Promise<void>(resolve => socket.on('connect', resolve));

    daemonProcess.kill();
    assert.ok(daemonProcess.killed);
  });
});
