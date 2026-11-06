/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { afterEach, describe, it, mock } from 'node:test';
import util from 'node:util';
import { escapeForLog, redactConnectOptionsForLogging, redactDaemonArgsForLogging, redactUrlForLogging, puppeteerLogger, saveLogsToFile, } from '../../src/utils/logger.js';
describe('puppeteerLogger', () => {
    afterEach(() => {
        mock.restoreAll();
    });
    it('should return undefined if debuglog is not enabled and no log file', () => {
        mock.method(util, 'debuglog', () => {
            return Object.assign(() => undefined, { enabled: false });
        });
        const logger = puppeteerLogger('test-prefix');
        assert.strictEqual(logger, undefined);
    });
    it('should return a logger function if debuglog is enabled and no log file', () => {
        const dbgMock = Object.assign(mock.fn(), { enabled: true });
        mock.method(util, 'debuglog', () => dbgMock);
        const logger = puppeteerLogger('test-prefix');
        assert.strictEqual(typeof logger, 'function');
        logger('hello %s', 'world');
        assert.strictEqual(dbgMock.mock.calls.length, 1);
        assert.strictEqual(dbgMock.mock.calls[0].arguments[0], '%s %s');
        const dateArg = dbgMock.mock.calls[0].arguments[1];
        assert.match(dateArg, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        assert.strictEqual(dbgMock.mock.calls[0].arguments[2], 'hello world');
    });
    it('should return a logger function that writes to file if log file is active', () => {
        const writeMock = mock.fn();
        const mockStream = {
            write: writeMock,
            on: mock.fn(),
        };
        mock.method(fs, 'createWriteStream', () => mockStream);
        const dbgMock = Object.assign(mock.fn(), { enabled: true });
        mock.method(util, 'debuglog', () => dbgMock);
        saveLogsToFile('dummy.log');
        const logger = puppeteerLogger('test-prefix');
        assert.strictEqual(typeof logger, 'function');
        logger('hello %s', 'world');
        assert.strictEqual(writeMock.mock.calls.length, 1);
        const writeArg = writeMock.mock.calls[0].arguments[0];
        assert.match(writeArg, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /);
        assert.ok(writeArg.includes('test-prefix'));
        assert.ok(writeArg.includes('hello world\n'));
    });
});
describe('escapeForLog', () => {
    it('returns a JSON string literal', () => {
        assert.strictEqual(escapeForLog('a"b\\c'), '"a\\"b\\\\c"');
    });
    it('escapes characters that break a log line or control a terminal', () => {
        const cases = [
            ['\n', '\\n'],
            ['\r', '\\r'],
            ['\u001b', '\\u001b'],
            ['\u007f', '\\u007f'],
            ['\u0085', '\\u0085'],
            ['\u009b', '\\u009b'],
            ['\u2028', '\\u2028'],
            ['\u2029', '\\u2029'],
        ];
        for (const [char, escaped] of cases) {
            assert.strictEqual(escapeForLog(`a${char}b`), `"a${escaped}b"`);
            assert.strictEqual(JSON.parse(escapeForLog(`a${char}b`)), `a${char}b`);
        }
    });
});
describe('sensitive connection logging', () => {
    it('removes URL userinfo and query parameters, failing closed on invalid URLs', () => {
        assert.strictEqual(redactUrlForLogging('wss://user:pass@example.test/browser?token=SECRET'), 'wss://example.test/browser?REDACTED');
        assert.strictEqual(redactUrlForLogging('http://example.test/json/version?key=SECRET'), 'http://example.test/json/version?REDACTED');
        assert.strictEqual(redactUrlForLogging('not a URL:SECRET'), '[REDACTED]');
    });
    it('redacts URLs and headers without changing the connection options', () => {
        const options = {
            browserWSEndpoint: 'wss://admin:password@example.test/ws?key=URL_SECRET',
            browserURL: 'http://example.test/json?token=OTHER_SECRET',
            headers: {
                Authorization: 'Bearer HEADER_SECRET',
                'X-Token': 'ALSO_SECRET',
            },
        };
        const sanitized = redactConnectOptionsForLogging(options);
        assert.deepStrictEqual(sanitized.headers, {
            Authorization: '[REDACTED]',
            'X-Token': '[REDACTED]',
        });
        for (const secret of [
            'password',
            'URL_SECRET',
            'OTHER_SECRET',
            'HEADER_SECRET',
            'ALSO_SECRET',
        ]) {
            assert.ok(!JSON.stringify(sanitized).includes(secret));
        }
        assert.strictEqual(options.headers.Authorization, 'Bearer HEADER_SECRET');
        assert.match(options.browserWSEndpoint, /URL_SECRET/);
    });
    it('redacts daemon startup flags without modifying the arguments passed to spawn', () => {
        const args = [
            '--wsHeaders',
            '{"Authorization":"Bearer HEADER_SECRET"}',
            '--wsEndpoint=wss://user:password@example.test/ws?token=URL_SECRET',
            '--browserUrl',
            'http://example.test?key=OTHER_SECRET',
            '--logFile',
            '/tmp/example.log',
            '--ws-headers={"X-Api-Key":"DASH_SECRET"}',
        ];
        const sanitized = redactDaemonArgsForLogging(args);
        assert.deepStrictEqual(sanitized, [
            '--wsHeaders',
            '[REDACTED]',
            '--wsEndpoint=wss://example.test/ws?REDACTED',
            '--browserUrl',
            'http://example.test/?REDACTED',
            '--logFile',
            '/tmp/example.log',
            '--ws-headers=[REDACTED]',
        ]);
        assert.match(args[1], /HEADER_SECRET/);
        assert.ok(!JSON.stringify(sanitized).includes('SECRET'));
        assert.ok(!JSON.stringify(sanitized).includes('password'));
    });
});
//# sourceMappingURL=logger.test.js.map