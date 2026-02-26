/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import {startDaemon, stopDaemon} from '../../src/daemon/client.js';
import {isDaemonRunning} from '../../src/daemon/utils.js';

describe('daemon client', () => {
  afterEach(async () => {
    if (isDaemonRunning()) {
      await stopDaemon();
      // Wait a bit for the daemon to fully terminate and clean up its files.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  it('should start and stop daemon', async () => {
    assert.ok(!isDaemonRunning(), 'Daemon should not be running initially');

    await startDaemon();
    assert.ok(isDaemonRunning(), 'Daemon should be running after start');

    await stopDaemon();
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.ok(!isDaemonRunning(), 'Daemon should not be running after stop');
  });

  it('should handle starting daemon when already running', async () => {
    await startDaemon();
    assert.ok(isDaemonRunning(), 'Daemon should be running');

    // Starting again should be a no-op
    await startDaemon();
    assert.ok(isDaemonRunning(), 'Daemon should still be running');
  });

  it('should handle stopping daemon when not running', async () => {
    assert.ok(!isDaemonRunning(), 'Daemon should not be running initially');

    // Stopping when not running should be a no-op
    await stopDaemon();
    assert.ok(!isDaemonRunning(), 'Daemon should still not be running');
  });
});
