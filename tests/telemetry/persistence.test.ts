/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {ClearcutLogger} from '../../src/telemetry/ClearcutLogger.js';
import {ErrorCode} from '../../src/telemetry/errors.js';
import * as persistence from '../../src/telemetry/persistence.js';
import {WatchdogClient} from '../../src/telemetry/WatchdogClient.js';
import {createTempDir} from '../utils.js';

describe('FilePersistence', () => {
  let logServerErrorStub: sinon.SinonStub;

  beforeEach(async () => {
    ClearcutLogger.resetForTesting();
    const mockWatchdog = sinon.createStubInstance(WatchdogClient);
    const mockPersistence = sinon.createStubInstance(
      persistence.FilePersistence,
    );
    mockPersistence.loadState.resolves({});
    const logger = ClearcutLogger.initialize({
      appVersion: '1.0.0',
      persistence: mockPersistence,
      watchdogClient: mockWatchdog,
    });
    logServerErrorStub = sinon.stub(logger, 'logServerError');
  });

  afterEach(async () => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  describe('loadState', () => {
    it('returns default state and does NOT log telemetry if file does not exist (ENOENT)', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      const state = await filePersistence.loadState();
      assert.deepStrictEqual(state, {});
      sinon.assert.notCalled(logServerErrorStub);
    });

    it('returns default state and LOGS telemetry if load fails due to corruption', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const filePath = path.join(tmpDir.path, 'telemetry_state.json');
      await fs.writeFile(filePath, 'not-valid-json', 'utf-8');

      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      const state = await filePersistence.loadState();

      assert.deepStrictEqual(state, {});
      sinon.assert.calledOnceWithExactly(logServerErrorStub, {
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
      });
    });

    it('returns default state and LOGS telemetry if load fails during read stage', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const filePath = path.join(tmpDir.path, 'telemetry_state.json');
      await fs.writeFile(filePath, '{"valid": "json"}', 'utf-8');

      const readFileStub = sinon
        .stub(fs, 'readFile')
        .rejects(new Error('Synthetic read error'));

      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      const state = await filePersistence.loadState();

      assert.deepStrictEqual(state, {});
      sinon.assert.calledOnceWithExactly(logServerErrorStub, {
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
      });

      readFileStub.restore();
    });

    it('returns default state and LOGS telemetry if state file is empty', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const filePath = path.join(tmpDir.path, 'telemetry_state.json');
      await fs.writeFile(filePath, '', 'utf-8');

      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      const state = await filePersistence.loadState();

      assert.deepStrictEqual(state, {});
      sinon.assert.calledOnceWithExactly(logServerErrorStub, {
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
      });
    });

    it('returns default state if lastActive is invalid date string', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const filePath = path.join(tmpDir.path, 'telemetry_state.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({lastActive: 'invalid-date'}),
        'utf-8',
      );

      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      const state = await filePersistence.loadState();

      assert.deepStrictEqual(state, {});
      sinon.assert.notCalled(logServerErrorStub);
    });

    it('returns default state if lastToolCall is invalid date string', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const filePath = path.join(tmpDir.path, 'telemetry_state.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          lastActive: '2023-01-01T00:00:00.000Z',
          lastToolCall: 'invalid-date',
        }),
        'utf-8',
      );

      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      const state = await filePersistence.loadState();

      assert.deepStrictEqual(state, {});
      sinon.assert.notCalled(logServerErrorStub);
    });

    it('returns stored state if file exists', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const expectedState = {
        lastActive: '2023-01-01T00:00:00.000Z',
        lastToolCall: '2023-01-01T12:00:00.000Z',
      };
      await fs.writeFile(
        path.join(tmpDir.path, 'telemetry_state.json'),
        JSON.stringify(expectedState),
      );

      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      const state = await filePersistence.loadState();
      assert.deepStrictEqual(state, expectedState);
    });
  });

  describe('saveState', () => {
    it('saves state to file', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      const state = {
        lastActive: '2023-01-01T00:00:00.000Z',
        lastToolCall: '2023-01-01T12:00:00.000Z',
      };
      const filePersistence = new persistence.FilePersistence(tmpDir.path);
      await filePersistence.saveState(state);

      const content = await fs.readFile(
        path.join(tmpDir.path, 'telemetry_state.json'),
        'utf-8',
      );
      assert.deepStrictEqual(JSON.parse(content), state);
      sinon.assert.notCalled(logServerErrorStub);
    });

    it('logs telemetry when failing to save to file', async () => {
      using tmpDir = createTempDir('telemetry-test-');
      // Force error by replacing directory with a file, causing mkdir to fail.
      const dirPath = path.join(tmpDir.path, 'blocked_dir');
      await fs.writeFile(dirPath, 'i-am-a-file');
      const filePersistence = new persistence.FilePersistence(dirPath);

      const state = {
        lastActive: '2023-01-01T00:00:00.000Z',
      };
      await filePersistence.saveState(state);

      sinon.assert.calledOnceWithExactly(logServerErrorStub, {
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_SAVE_FAILED,
      });
    });
  });
});
