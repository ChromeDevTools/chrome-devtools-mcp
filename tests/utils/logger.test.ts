/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {afterEach, describe, it, mock} from 'node:test';
import util from 'node:util';

import {puppeteerLogger, saveLogsToFile} from '../../src/utils/logger.js';

describe('puppeteerLogger', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('should return undefined if debuglog is not enabled and no log file', () => {
    mock.method(util, 'debuglog', () => {
      return Object.assign(() => undefined, {enabled: false});
    });

    const logger = puppeteerLogger('test-prefix');
    assert.strictEqual(logger, undefined);
  });

  it('should return a logger function if debuglog is enabled and no log file', () => {
    const dbgMock = Object.assign(mock.fn(), {enabled: true});
    mock.method(util, 'debuglog', () => dbgMock);

    const logger = puppeteerLogger('test-prefix');
    assert.strictEqual(typeof logger, 'function');

    logger!('hello %s', 'world');

    assert.strictEqual(dbgMock.mock.calls.length, 1);
    assert.strictEqual(dbgMock.mock.calls[0].arguments[0], '%s %s');
    const dateArg = dbgMock.mock.calls[0].arguments[1] as string;
    assert.match(dateArg, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.strictEqual(dbgMock.mock.calls[0].arguments[2], 'hello world');
  });

  it('should return a logger function that writes to file if log file is active', () => {
    const writeMock = mock.fn();
    const mockStream = {
      write: writeMock,
      on: mock.fn(),
    } as unknown as fs.WriteStream;

    mock.method(fs, 'createWriteStream', () => mockStream);
    const dbgMock = Object.assign(mock.fn(), {enabled: true});
    mock.method(util, 'debuglog', () => dbgMock);

    saveLogsToFile('dummy.log');

    const logger = puppeteerLogger('test-prefix');
    assert.strictEqual(typeof logger, 'function');

    logger!('hello %s', 'world');

    assert.strictEqual(writeMock.mock.calls.length, 1);
    const writeArg = writeMock.mock.calls[0].arguments[0] as string;
    assert.match(writeArg, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /);
    assert.ok(writeArg.includes('test-prefix'));
    assert.ok(writeArg.includes('hello world\n'));
  });
});
