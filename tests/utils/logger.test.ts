/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'puppeteer-logger-fixture.js');

/**
 * Runs the puppeteer-logger-fixture in a fresh child process with the given
 * NODE_DEBUG value. A fresh process is required because
 * `util.debuglog(...).enabled` reflects NODE_DEBUG as of process start, not
 * a value that can be toggled at runtime (see the fixture's own comment).
 */
function runFixture(
  prefix: string,
  logFilePath: string | undefined,
  nodeDebug: string | undefined,
): string {
  const env = {...process.env};
  if (nodeDebug === undefined) {
    delete env.NODE_DEBUG;
  } else {
    env.NODE_DEBUG = nodeDebug;
  }
  return execFileSync(
    process.execPath,
    [FIXTURE, prefix, logFilePath ?? '--'],
    {env, encoding: 'utf8'},
  ).trim();
}

describe('puppeteerLogger', () => {
  it('does not log to a file when the namespace is not DEBUG-enabled', () => {
    const logFilePath = path.join(
      os.tmpdir(),
      `puppeteer-logger-test-${process.pid}-${Date.now()}.log`,
    );
    try {
      const result = runFixture(
        'puppeteer:protocol:SEND',
        logFilePath,
        'mcp:log', // DEBUG is set, but does not include this prefix.
      );
      assert.strictEqual(result, 'logger:undefined');
      // saveLogsToFile() creates the file unconditionally (--log-file is a
      // global option, independent of any specific namespace), so the
      // regression check is on CONTENT, not existence: the file must stay
      // empty rather than receiving this namespace's traffic.
      const contents = fs.existsSync(logFilePath)
        ? fs.readFileSync(logFilePath, 'utf8')
        : '';
      assert.strictEqual(
        contents,
        '',
        'puppeteerLogger must not write to the log file for a namespace ' +
          'that is not enabled via NODE_DEBUG, even when --log-file is set',
      );
    } finally {
      fs.rmSync(logFilePath, {force: true});
    }
  });

  it('logs to a file when the namespace is DEBUG-enabled', () => {
    const logFilePath = path.join(
      os.tmpdir(),
      `puppeteer-logger-test-${process.pid}-${Date.now()}.log`,
    );
    try {
      const result = runFixture(
        'puppeteer:protocol:SEND',
        logFilePath,
        'puppeteer:protocol:SEND',
      );
      assert.strictEqual(result, 'logger:defined');
      const contents = fs.readFileSync(logFilePath, 'utf8');
      assert.match(contents, /puppeteer:protocol:SEND fixture message/);
    } finally {
      fs.rmSync(logFilePath, {force: true});
    }
  });

  it('logs to a file when NODE_DEBUG=* enables every namespace', () => {
    const logFilePath = path.join(
      os.tmpdir(),
      `puppeteer-logger-test-${process.pid}-${Date.now()}.log`,
    );
    try {
      const result = runFixture('puppeteer:protocol:RECV', logFilePath, '*');
      assert.strictEqual(result, 'logger:defined');
      const contents = fs.readFileSync(logFilePath, 'utf8');
      assert.match(contents, /puppeteer:protocol:RECV fixture message/);
    } finally {
      fs.rmSync(logFilePath, {force: true});
    }
  });

  it('returns undefined (no debuglog fallback either) when no log file and namespace is disabled', () => {
    const result = runFixture('puppeteer:protocol:SEND', undefined, undefined);
    assert.strictEqual(result, 'logger:undefined');
  });
});
