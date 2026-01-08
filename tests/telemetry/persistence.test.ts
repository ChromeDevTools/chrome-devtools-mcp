/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

import assert from 'assert';

import * as persistence from '../../src/telemetry/persistence.js';

describe('FilePersistence', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      await fs.realpath(process.env.TMPDIR || '/tmp'),
      `telemetry-test-${crypto.randomUUID()}`,
    );
    await fs.mkdir(tmpDir, {recursive: true});
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  describe('loadState', () => {
    it('returns default state if file does not exist', async () => {
      const filePersistence = new persistence.FilePersistence(tmpDir);
      const state = await filePersistence.loadState();
      assert.deepStrictEqual(state, {
        lastActive: '',
        firstTimeSent: false,
      });
    });

    it('returns stored state if file exists', async () => {
      const expectedState = {
        lastActive: '2023-01-01T00:00:00.000Z',
        firstTimeSent: true,
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
        firstTimeSent: true,
      };
      const filePersistence = new persistence.FilePersistence(tmpDir);
      await filePersistence.saveState(state);

      const content = await fs.readFile(
        path.join(tmpDir, 'telemetry_state.json'),
        'utf-8',
      );
      assert.deepStrictEqual(JSON.parse(content), state);
    });
  });

});
