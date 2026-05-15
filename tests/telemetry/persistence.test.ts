/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {ClearcutLogger} from '../../src/telemetry/ClearcutLogger.js';
import {ErrorCode} from '../../src/telemetry/errors.js';
import * as persistence from '../../src/telemetry/persistence.js';
import {WatchdogClient} from '../../src/telemetry/WatchdogClient.js';

describe('FilePersistence', () => {
  let tmpDir: string;
  let logServerErrorStub: sinon.SinonStub;

  beforeEach(async () => {
    tmpDir = path.join(
      await fs.realpath(os.tmpdir()),
      `telemetry-test-${crypto.randomUUID()}`,
    );
    await fs.mkdir(tmpDir, {recursive: true});

    ClearcutLogger.resetForTesting();
    const mockWatchdog = sinon.createStubInstance(WatchdogClient);
    const logger = ClearcutLogger.initialize({
      appVersion: '1.0.0',
      persistence: new persistence.FilePersistence(tmpDir),
      watchdogClient: mockWatchdog,
    });
    logServerErrorStub = sinon.stub(logger, 'logServerError');
  });

  afterEach(async () => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  describe('loadState', () => {
    it('returns default state and does NOT log telemetry if file does not exist (ENOENT)', async () => {
      const filePersistence = new persistence.FilePersistence(tmpDir);
      const state = await filePersistence.loadState();
      assert.deepStrictEqual(state, {
        lastActive: '',
      });
      assert(logServerErrorStub.notCalled);
    });

    it('returns default state and LOGS telemetry if load fails due to corruption', async () => {
      const filePath = path.join(tmpDir, 'telemetry_state.json');
      await fs.writeFile(filePath, 'not-valid-json', 'utf-8');

      const filePersistence = new persistence.FilePersistence(tmpDir);
      const state = await filePersistence.loadState();

      assert.deepStrictEqual(state, {
        lastActive: '',
      });
      assert(logServerErrorStub.calledOnce);
      assert.deepStrictEqual(logServerErrorStub.firstCall.args[0], {
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
      });
    });

    it('returns default state and LOGS telemetry if load fails during read stage', async () => {
      const filePath = path.join(tmpDir, 'telemetry_state.json');
      await fs.writeFile(filePath, '{"valid": "json"}', 'utf-8');

      const readFileStub = sinon
        .stub(fs, 'readFile')
        .rejects(new Error('Synthetic read error'));

      const filePersistence = new persistence.FilePersistence(tmpDir);
      const state = await filePersistence.loadState();

      assert.deepStrictEqual(state, {
        lastActive: '',
      });
      assert(logServerErrorStub.calledOnce);
      assert.deepStrictEqual(logServerErrorStub.firstCall.args[0], {
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
      });

      readFileStub.restore();
    });

    it('returns stored state if file exists', async () => {
      const expectedState = {
        lastActive: '2023-01-01T00:00:00.000Z',
      };
      await fs.writeFile(
        path.join(tmpDir, 'telemetry_state.json'),
        JSON.stringify(expectedState),
      );

      const filePersistence = new persistence.FilePersistence(tmpDir);
      const state = await filePersistence.loadState();
      assert.deepStrictEqual(state, expectedState);
    });
  });

  describe('saveState', () => {
    it('saves state to file', async () => {
      const state = {
        lastActive: '2023-01-01T00:00:00.000Z',
      };
      const filePersistence = new persistence.FilePersistence(tmpDir);
      await filePersistence.saveState(state);

      const content = await fs.readFile(
        path.join(tmpDir, 'telemetry_state.json'),
        'utf-8',
      );
      assert.deepStrictEqual(JSON.parse(content), state);
      assert(logServerErrorStub.notCalled);
    });

    it('logs telemetry when failing to save to file', async () => {
      // Force error by replacing directory with a file, causing mkdir to fail.
      const dirPath = path.join(tmpDir, 'blocked_dir');
      await fs.writeFile(dirPath, 'i-am-a-file');
      const filePersistence = new persistence.FilePersistence(dirPath);

      const state = {
        lastActive: '2023-01-01T00:00:00.000Z',
      };
      await filePersistence.saveState(state);

      assert(logServerErrorStub.calledOnce);
      assert.deepStrictEqual(logServerErrorStub.firstCall.args[0], {
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_SAVE_FAILED,
      });
    });
  });
});
