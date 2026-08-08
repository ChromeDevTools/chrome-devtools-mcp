/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import type fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';

import {debug} from '../../src/third_party/index.js';
import {flushLogs, logger, saveLogsToFile} from '../../src/utils/logger.js';

describe('logger', () => {
  let savedNamespaces: string;
  let originalLog: typeof debug.log;
  let tmpDir: string;

  before(async () => {
    // Capture the globally enabled debug namespaces and the log sink so they
    // can be restored after the suite (saveLogsToFile mutates both).
    savedNamespaces = debug.disable();
    debug.enable(savedNamespaces);
    originalLog = debug.log;
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'logger-test-'));
  });

  after(async () => {
    debug.log = originalLog;
    debug.disable();
    if (savedNamespaces) {
      debug.enable(savedNamespaces);
    }
    await fsPromises.rm(tmpDir, {recursive: true, force: true});
  });

  describe('saveLogsToFile', () => {
    it('writes logger output to the given file', async () => {
      const file = path.join(tmpDir, 'basic.log');
      const stream = saveLogsToFile(file);
      assert.ok(logger);
      logger('hello world');
      await flushLogs(stream);
      const content = await fsPromises.readFile(file, 'utf8');
      assert.ok(content.includes('mcp:log'));
      assert.ok(content.includes('hello world'));
      assert.ok(content.endsWith('\n'));
    });

    it('enables the mcp:log debug namespace', async () => {
      debug.disable();
      assert.strictEqual(debug.enabled('mcp:log'), false);
      const stream = saveLogsToFile(path.join(tmpDir, 'namespace.log'));
      assert.strictEqual(debug.enabled('mcp:log'), true);
      await flushLogs(stream);
    });

    it('appends to an existing file instead of truncating it', async () => {
      const file = path.join(tmpDir, 'append.log');
      await fsPromises.writeFile(file, 'existing content\n');
      const stream = saveLogsToFile(file);
      assert.ok(logger);
      logger('new entry');
      await flushLogs(stream);
      const content = await fsPromises.readFile(file, 'utf8');
      assert.ok(content.startsWith('existing content\n'));
      assert.ok(content.includes('new entry'));
    });

    it('writes one line per log call', async () => {
      const file = path.join(tmpDir, 'lines.log');
      const stream = saveLogsToFile(file);
      assert.ok(logger);
      logger('first entry');
      logger('second entry');
      await flushLogs(stream);
      const content = await fsPromises.readFile(file, 'utf8');
      const lines = content.split('\n').filter(line => line.length > 0);
      assert.strictEqual(lines.length, 2);
      assert.ok(lines[0].includes('first entry'));
      assert.ok(lines[1].includes('second entry'));
    });
  });

  describe('flushLogs', () => {
    it('resolves once the stream has finished', async () => {
      const file = path.join(tmpDir, 'flush.log');
      const stream = saveLogsToFile(file);
      assert.ok(logger);
      logger('flushed');
      await flushLogs(stream);
      assert.strictEqual(stream.writableFinished, true);
    });

    it('rejects when the stream does not finish within the timeout', async () => {
      const neverFinishing = {
        end() {
          // Never invokes the callback.
        },
      } as unknown as fs.WriteStream;
      let rejected = false;
      try {
        await flushLogs(neverFinishing, 10);
      } catch {
        rejected = true;
      }
      assert.strictEqual(rejected, true);
    });
  });
});
