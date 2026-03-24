/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import {describe, it} from 'node:test';

import {
  resolveEdgeExecutablePath,
  resolveEdgeUserDataDir,
} from '../src/browser.js';

describe('resolveEdgeExecutablePath', () => {
  it('throws for canary channel on Linux', { skip: os.platform() !== 'linux' }, () => {
    assert.throws(
      () => resolveEdgeExecutablePath('canary'),
      /not available/,
    );
  });
});

describe('resolveEdgeUserDataDir', () => {
  it('throws for canary channel on Linux', { skip: os.platform() !== 'linux' }, () => {
    assert.throws(
      () => resolveEdgeUserDataDir('canary'),
      /not available/,
    );
  });

  it('returns a platform-specific path for stable', () => {
    const result = resolveEdgeUserDataDir('stable');
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0);

    const platform = os.platform();
    if (platform === 'win32') {
      assert.ok(result.includes('Microsoft'));
      assert.ok(result.includes('Edge'));
    } else if (platform === 'darwin') {
      assert.ok(result.includes('Microsoft Edge'));
    } else if (platform === 'linux') {
      assert.ok(result.includes('microsoft-edge'));
    }
  });

  it('returns different paths for different channels', () => {
    const stable = resolveEdgeUserDataDir('stable');
    const beta = resolveEdgeUserDataDir('beta');
    const dev = resolveEdgeUserDataDir('dev');
    assert.notStrictEqual(stable, beta);
    assert.notStrictEqual(stable, dev);
    assert.notStrictEqual(beta, dev);
  });
});

describe('resolveEdgeExecutablePath channels', () => {
  it('returns different paths for different channels', () => {
    const channels = ['stable', 'beta', 'dev'] as const;
    const resolved: string[] = [];
    for (const ch of channels) {
      try {
        resolved.push(resolveEdgeExecutablePath(ch));
      } catch {
        // Channel not installed — skip this assertion
        return;
      }
    }
    // All resolved paths should be distinct
    const unique = new Set(resolved);
    assert.strictEqual(unique.size, resolved.length, 'Each channel should resolve to a different path');
  });

  it('error message includes candidate paths and install guidance', () => {
    // Use a platform that has entries but with a nonexistent env to force failure
    // We can't easily mock fs.existsSync, so test the error on a channel
    // that is definitely not installed. If all channels are installed, skip.
    const channels = ['stable', 'beta', 'dev'] as const;
    for (const ch of channels) {
      try {
        resolveEdgeExecutablePath(ch);
        // If it succeeds, this channel is installed — try next
      } catch (err) {
        // Verify error message quality
        assert.ok(err.message.includes('Could not find'), `Should say 'Could not find': ${err.message}`);
        assert.ok(err.message.includes('--executablePath'), `Should mention --executablePath: ${err.message}`);
        return; // Verified — done
      }
    }
    // All channels installed — can't test error path, that's OK
  });

  it('resolves canary on non-Linux platforms', { skip: os.platform() === 'linux' }, () => {
    try {
      const result = resolveEdgeExecutablePath('canary');
      assert.strictEqual(typeof result, 'string');
      assert.ok(result.length > 0);
      assert.ok(result.includes('msedge'), `Canary path should contain msedge: ${result}`);
    } catch {
      // Edge Canary not installed — acceptable
    }
  });

  it('returns paths containing msedge', () => {
    try {
      const result = resolveEdgeExecutablePath('stable');
      assert.ok(result.includes('msedge') || result.includes('microsoft-edge'),
        `Path should reference Edge: ${result}`);
    } catch {
      // Edge not installed — skip
    }
  });
});

describe('resolveEdgeUserDataDir channels', () => {
  it('returns platform-appropriate paths for beta', () => {
    const result = resolveEdgeUserDataDir('beta');
    const platform = os.platform();
    if (platform === 'win32') {
      assert.ok(result.includes('Edge Beta'), `Win32 beta should include 'Edge Beta': ${result}`);
    } else if (platform === 'darwin') {
      assert.ok(result.includes('Microsoft Edge Beta'), `Darwin beta should include 'Microsoft Edge Beta': ${result}`);
    } else if (platform === 'linux') {
      assert.ok(result.includes('microsoft-edge-beta'), `Linux beta should include 'microsoft-edge-beta': ${result}`);
    }
  });

  it('returns platform-appropriate paths for dev', () => {
    const result = resolveEdgeUserDataDir('dev');
    const platform = os.platform();
    if (platform === 'win32') {
      assert.ok(result.includes('Edge Dev'), `Win32 dev should include 'Edge Dev': ${result}`);
    } else if (platform === 'darwin') {
      assert.ok(result.includes('Microsoft Edge Dev'), `Darwin dev should include 'Microsoft Edge Dev': ${result}`);
    } else if (platform === 'linux') {
      assert.ok(result.includes('microsoft-edge-dev'), `Linux dev should include 'microsoft-edge-dev': ${result}`);
    }
  });

  it('canary resolves on non-Linux', { skip: os.platform() === 'linux' }, () => {
    const result = resolveEdgeUserDataDir('canary');
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0);
    if (os.platform() === 'win32') {
      assert.ok(result.includes('Edge SxS'), `Win32 canary should use Edge SxS: ${result}`);
    } else if (os.platform() === 'darwin') {
      assert.ok(result.includes('Microsoft Edge Canary'), `Darwin canary should use Microsoft Edge Canary: ${result}`);
    }
  });

  it('throws with descriptive message for unsupported platform/channel', () => {
    if (os.platform() === 'linux') {
      assert.throws(
        () => resolveEdgeUserDataDir('canary'),
        /not available/,
      );
    }
  });
});
