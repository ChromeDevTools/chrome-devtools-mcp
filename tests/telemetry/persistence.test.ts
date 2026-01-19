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

import * as persistence from '../../src/telemetry/persistence.js';

describe('FilePersistence', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      await fs.realpath(os.tmpdir()),
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
      });
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
    });
  });
});
