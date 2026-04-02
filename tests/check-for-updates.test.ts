/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import child_process from 'node:child_process';
import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import {afterEach, beforeEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  checkForUpdates,
  resetUpdateCheckFlagForTesting,
} from '../src/utils/check-for-updates.js';
import {VERSION} from '../src/version.js';

describe('checkForUpdates', () => {
  beforeEach(() => {
    sinon.stub(fs, 'mkdir').resolves();
    sinon.stub(fs, 'utimes').resolves();
    sinon.stub(fs, 'writeFile').resolves();
  });

  afterEach(() => {
    sinon.restore();
    resetUpdateCheckFlagForTesting();
  });

  it('does nothing if CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS is set', async () => {
    process.env['CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS'] = 'true';

    const warnStub = sinon.stub(console, 'warn');
    const spawnStub = sinon.stub(child_process, 'spawn');
    const readFileStub = sinon.stub(fs, 'readFile');
    const statStub = sinon.stub(fs, 'stat');

    await checkForUpdates('Run `npm update` to update.');

    assert.ok(warnStub.notCalled);
    assert.ok(spawnStub.notCalled);
    assert.ok(readFileStub.notCalled);
    assert.ok(statStub.notCalled);

    delete process.env['CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS'];
  });

  it('notifies if cache exists and version is different', async () => {
    sinon.stub(os, 'homedir').returns('/home/user');
    sinon.stub(fs, 'stat').resolves({mtimeMs: Date.now()} as unknown as Stats);
    sinon.stub(fs, 'readFile').callsFake(async filePath => {
      if (filePath.toString().includes('latest.json')) {
        return JSON.stringify({
          version: '99.9.9',
        });
      }
      throw new Error(`File not found: ${filePath}`);
    });
    const warnStub = sinon.stub(console, 'warn');
    const spawnStub = sinon.stub(child_process, 'spawn');

    await checkForUpdates('Run `npm update` to update.');

    assert.ok(
      warnStub.calledWith(
        sinon.match('Update available: ' + VERSION + ' -> 99.9.9'),
      ),
    );
    assert.ok(spawnStub.notCalled);
  });

  it('does not spawn fetch process if cache is fresh', async () => {
    sinon.stub(os, 'homedir').returns('/home/user');
    sinon.stub(fs, 'stat').resolves({mtimeMs: Date.now()} as unknown as Stats);
    sinon.stub(fs, 'readFile').callsFake(async filePath => {
      if (filePath.toString().includes('latest.json')) {
        return JSON.stringify({
          version: VERSION,
        });
      }
      throw new Error(`File not found: ${filePath}`);
    });
    const spawnStub = sinon.stub(child_process, 'spawn');

    await checkForUpdates('Run `npm update` to update.');

    assert.ok(spawnStub.notCalled);
  });

  it('spawns detached process if cache is stale', async () => {
    sinon.stub(os, 'homedir').returns('/home/user');
    sinon.stub(fs, 'stat').resolves({
      mtimeMs: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    } as unknown as Stats);
    sinon.stub(fs, 'readFile').callsFake(async filePath => {
      if (filePath.toString().includes('latest.json')) {
        return JSON.stringify({
          version: VERSION,
        });
      }
      throw new Error(`File not found: ${filePath}`);
    });

    const unrefSpy = sinon.spy();
    const spawnStub = sinon.stub(child_process, 'spawn').returns({
      unref: unrefSpy,
    } as unknown as child_process.ChildProcess);

    await checkForUpdates('Run `npm update` to update.');

    assert.ok(spawnStub.calledOnce);
    assert.strictEqual(spawnStub.firstCall.args[0], process.execPath);
    assert.ok(
      spawnStub.firstCall.args[1][0]?.includes('check-latest-version.js'),
    );
    assert.ok(spawnStub.firstCall.args[1][1]?.includes('latest.json'));
    assert.strictEqual(spawnStub.firstCall.args[2]?.detached, true);
    assert.ok(unrefSpy.calledOnce);
  });

  it('spawns detached process if cache is missing', async () => {
    sinon.stub(os, 'homedir').returns('/home/user');
    sinon.stub(fs, 'stat').rejects(new Error('File not found'));
    sinon.stub(fs, 'readFile').callsFake(async filePath => {
      throw new Error(`File not found: ${filePath}`);
    });

    const unrefSpy = sinon.spy();
    const spawnStub = sinon.stub(child_process, 'spawn').returns({
      unref: unrefSpy,
    } as unknown as child_process.ChildProcess);

    await checkForUpdates('Run `npm update` to update.');

    assert.ok(spawnStub.calledOnce);
    assert.strictEqual(spawnStub.firstCall.args[0], process.execPath);
    assert.ok(
      spawnStub.firstCall.args[1][0]?.includes('check-latest-version.js'),
    );
    assert.ok(spawnStub.firstCall.args[1][1]?.includes('latest.json'));
    assert.strictEqual(spawnStub.firstCall.args[2]?.detached, true);
    assert.ok(unrefSpy.calledOnce);
  });
});
