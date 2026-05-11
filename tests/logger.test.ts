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

import {flushLogs, logger, saveLogsToFile} from '../src/logger.js';

describe('logger', () => {
  it('prefixes log file lines with process identity', async () => {
    const logPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'cdt-mcp-log-')),
      'shared.log',
    );
    const logFile = saveLogsToFile(logPath);

    logger('first line\nsecond line');
    await flushLogs(logFile);

    const log = await fs.readFile(logPath, 'utf8');
    assert.match(
      log,
      new RegExp(
        `\\[pid=${process.pid} ppid=${process.ppid}\\] Chrome DevTools MCP log started`,
      ),
    );
    assert.match(
      log,
      new RegExp(`\\[pid=${process.pid} ppid=${process.ppid}\\].*first line`),
    );
    assert.match(
      log,
      new RegExp(`\\[pid=${process.pid} ppid=${process.ppid}\\] second line`),
    );
  });
});
