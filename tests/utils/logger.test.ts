/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {saveLogsToFile, flushLogs} from '../../src/utils/logger.js';

describe('logger utilities', () => {
  it('writes and flushes to file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logger-test-'));
    try {
      const logPath = path.join(tmpDir, 'out.log');
      const stream = saveLogsToFile(logPath);

      // Write directly to stream; saveLogsToFile also patches debug.log but
      // writing here verifies flush behavior.
      stream.write('hello-logger\n');

      await flushLogs(stream, 2000);

      const content = await fs.readFile(logPath, 'utf8');
      assert.match(content, /hello-logger/);
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });
});
