/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { serializeArgs, assertValidSessionId, getSocketPath, getRuntimeHome, getPidFilePath, getDaemonPid, isDaemonRunning, IS_WINDOWS, } from '../../src/daemon/utils.js';
import { createTempDir } from '../utils.js';
const APP_NAME = 'chrome-devtools-mcp';
const SESSION_ID = 'aabbccdd-1122-3344-5566-77889900aabb';
describe('assertValidSessionId', () => {
    it('should not throw for empty sessionId', () => {
        assert.doesNotThrow(() => assertValidSessionId(''));
    });
    it('should not throw for valid UUID', () => {
        assert.doesNotThrow(() => assertValidSessionId('123e4567-e89b-12d3-a456-426614174000'));
        assert.doesNotThrow(() => assertValidSessionId('aabbccdd-1122-3344-5566-77889900aabb'));
    });
    it('should throw for invalid sessionId formats', () => {
        assert.throws(() => assertValidSessionId('../../../etc/passwd'), /Invalid sessionId/);
        assert.throws(() => assertValidSessionId('sessionId_with_underscore'), /Invalid sessionId/);
        assert.throws(() => assertValidSessionId('session@id'), /Invalid sessionId/);
    });
});
describe('serializeArgs', () => {
    it('should ignore undefined or null values', () => {
        const options = {
            foo: {},
            bar: {},
            baz: {},
        };
        const argv = {
            foo: undefined,
            bar: null,
            baz: 'value',
            _: [],
            $0: 'test',
        };
        const result = serializeArgs(options, argv);
        assert.deepStrictEqual(result, ['--baz=value']);
    });
    it('should handle boolean values', () => {
        const options = { foo: {}, bar: {} };
        const argv = {
            foo: true,
            bar: false,
            _: [],
            $0: 'test',
        };
        const result = serializeArgs(options, argv);
        assert.deepStrictEqual(result, ['--foo', '--no-bar']);
    });
    it('should handle array values including hyphenated flags', () => {
        const options = { foo: {}, chromeArg: {} };
        const argv = {
            foo: ['val1', 'val2'],
            chromeArg: [
                '--use-fake-device-for-media-stream',
                '--use-file-for-fake-audio-capture=/tmp/test.wav',
            ],
            _: [],
            $0: 'test',
        };
        const result = serializeArgs(options, argv);
        assert.deepStrictEqual(result, [
            '--foo=val1',
            '--foo=val2',
            '--chrome-arg=--use-fake-device-for-media-stream',
            '--chrome-arg=--use-file-for-fake-audio-capture=/tmp/test.wav',
        ]);
    });
    it('should handle primitive values', () => {
        const options = { foo: {}, bar: {} };
        const argv = {
            foo: 'string',
            bar: 42,
            _: [],
            $0: 'test',
        };
        const result = serializeArgs(options, argv);
        assert.deepStrictEqual(result, ['--foo=string', '--bar=42']);
    });
    it('should convert camelCase keys to kebab-case', () => {
        const options = {
            camelCaseKey: {},
            anotherKey: {},
        };
        const argv = {
            camelCaseKey: 'value1',
            anotherKey: true,
            _: [],
            $0: 'test',
        };
        const result = serializeArgs(options, argv);
        assert.deepStrictEqual(result, [
            '--camel-case-key=value1',
            '--another-key',
        ]);
    });
});
describe('getRuntimeHome', () => {
    let savedXdgRuntimeDir;
    beforeEach(() => {
        savedXdgRuntimeDir = process.env['XDG_RUNTIME_DIR'];
    });
    afterEach(() => {
        if (savedXdgRuntimeDir === undefined) {
            delete process.env['XDG_RUNTIME_DIR'];
        }
        else {
            process.env['XDG_RUNTIME_DIR'] = savedXdgRuntimeDir;
        }
    });
    it('uses XDG_RUNTIME_DIR when set', () => {
        const xdgDir = path.join(os.tmpdir(), 'xdg-test');
        process.env['XDG_RUNTIME_DIR'] = xdgDir;
        assert.strictEqual(getRuntimeHome(''), path.join(xdgDir, APP_NAME));
        assert.strictEqual(getRuntimeHome(SESSION_ID), path.join(xdgDir, `${APP_NAME}-${SESSION_ID}`));
    });
    it('falls back to /tmp with the uid when XDG_RUNTIME_DIR is unset', { skip: IS_WINDOWS }, () => {
        delete process.env['XDG_RUNTIME_DIR'];
        const uid = os.userInfo().uid;
        assert.strictEqual(getRuntimeHome(''), `/tmp/${APP_NAME}-${uid}`);
        assert.strictEqual(getRuntimeHome(SESSION_ID), `/tmp/${APP_NAME}-${SESSION_ID}-${uid}`);
    });
    it('falls back to os.tmpdir() on Windows when XDG_RUNTIME_DIR is unset', { skip: !IS_WINDOWS }, () => {
        delete process.env['XDG_RUNTIME_DIR'];
        assert.strictEqual(getRuntimeHome(''), path.join(os.tmpdir(), APP_NAME));
    });
    it('throws for invalid session ids', () => {
        assert.throws(() => getRuntimeHome('../escape'), /Invalid sessionId/);
    });
});
describe('getSocketPath', () => {
    let savedXdgRuntimeDir;
    beforeEach(() => {
        savedXdgRuntimeDir = process.env['XDG_RUNTIME_DIR'];
    });
    afterEach(() => {
        if (savedXdgRuntimeDir === undefined) {
            delete process.env['XDG_RUNTIME_DIR'];
        }
        else {
            process.env['XDG_RUNTIME_DIR'] = savedXdgRuntimeDir;
        }
    });
    it('uses XDG_RUNTIME_DIR when set', { skip: IS_WINDOWS }, () => {
        const xdgDir = path.join(os.tmpdir(), 'xdg-test');
        process.env['XDG_RUNTIME_DIR'] = xdgDir;
        assert.strictEqual(getSocketPath(''), path.join(xdgDir, APP_NAME, 'server.sock'));
        assert.strictEqual(getSocketPath(SESSION_ID), path.join(xdgDir, `${APP_NAME}-${SESSION_ID}`, 'server.sock'));
    });
    it('falls back to the private runtime directory when XDG_RUNTIME_DIR is unset', { skip: IS_WINDOWS }, () => {
        delete process.env['XDG_RUNTIME_DIR'];
        assert.strictEqual(getSocketPath(''), path.join(getRuntimeHome(''), 'server.sock'));
        assert.strictEqual(getSocketPath(SESSION_ID), path.join(getRuntimeHome(SESSION_ID), 'server.sock'));
    });
    it('stays under the POSIX socket path length limit for UUID session ids', { skip: IS_WINDOWS }, () => {
        delete process.env['XDG_RUNTIME_DIR'];
        // macOS limits sun_path to 104 characters.
        assert.ok(getSocketPath(SESSION_ID).length < 104);
    });
    it('uses a named pipe on Windows', { skip: !IS_WINDOWS }, () => {
        const socketPath = getSocketPath(SESSION_ID);
        assert.ok(socketPath.startsWith('\\\\.\\pipe\\'));
        assert.ok(socketPath.includes(SESSION_ID));
        // The username is appended to prevent cross-user pipe squatting.
        assert.ok(socketPath.includes(os.userInfo().username));
    });
    it('throws for invalid session ids', () => {
        assert.throws(() => getSocketPath('../escape'), /Invalid sessionId/);
    });
});
describe('getPidFilePath', () => {
    it('is daemon.pid inside the runtime home', () => {
        assert.strictEqual(getPidFilePath(SESSION_ID), path.join(getRuntimeHome(SESSION_ID), 'daemon.pid'));
        assert.strictEqual(path.basename(getPidFilePath('')), 'daemon.pid');
    });
    it('throws for invalid session ids', () => {
        assert.throws(() => getPidFilePath('../escape'), /Invalid sessionId/);
    });
});
describe('daemon pid handling', () => {
    let savedXdgRuntimeDir;
    beforeEach(() => {
        savedXdgRuntimeDir = process.env['XDG_RUNTIME_DIR'];
    });
    afterEach(() => {
        if (savedXdgRuntimeDir === undefined) {
            delete process.env['XDG_RUNTIME_DIR'];
        }
        else {
            process.env['XDG_RUNTIME_DIR'] = savedXdgRuntimeDir;
        }
    });
    function writePidFile(sessionId, contents) {
        const pidFile = getPidFilePath(sessionId);
        fs.mkdirSync(path.dirname(pidFile), { recursive: true });
        fs.writeFileSync(pidFile, contents);
    }
    describe('getDaemonPid', () => {
        it('returns null when no pid file exists', () => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_1, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                assert.strictEqual(getDaemonPid(SESSION_ID), null);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        });
        it('reads the pid from the pid file, ignoring whitespace', () => {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_2, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                writePidFile(SESSION_ID, '12345\n');
                assert.strictEqual(getDaemonPid(SESSION_ID), 12345);
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        });
        it('is scoped per session id', () => {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_3, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                writePidFile(SESSION_ID, '12345\n');
                assert.strictEqual(getDaemonPid('00000000-0000'), null);
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                __disposeResources(env_3);
            }
        });
        it('returns null for empty or non-numeric pid files', () => {
            const env_4 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_4, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                writePidFile(SESSION_ID, '');
                assert.strictEqual(getDaemonPid(SESSION_ID), null);
                writePidFile(SESSION_ID, 'not-a-pid');
                assert.strictEqual(getDaemonPid(SESSION_ID), null);
            }
            catch (e_4) {
                env_4.error = e_4;
                env_4.hasError = true;
            }
            finally {
                __disposeResources(env_4);
            }
        });
        it('parses the leading integer of malformed contents', () => {
            const env_5 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_5, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                // Documents current parseInt-based behavior.
                writePidFile(SESSION_ID, '123abc');
                assert.strictEqual(getDaemonPid(SESSION_ID), 123);
            }
            catch (e_5) {
                env_5.error = e_5;
                env_5.hasError = true;
            }
            finally {
                __disposeResources(env_5);
            }
        });
    });
    describe('isDaemonRunning', () => {
        it('returns false when no pid file exists', () => {
            const env_6 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_6, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                assert.strictEqual(isDaemonRunning(SESSION_ID), false);
            }
            catch (e_6) {
                env_6.error = e_6;
                env_6.hasError = true;
            }
            finally {
                __disposeResources(env_6);
            }
        });
        it('returns true when the pid file points to a live process', () => {
            const env_7 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_7, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                writePidFile(SESSION_ID, `${process.pid}\n`);
                assert.strictEqual(isDaemonRunning(SESSION_ID), true);
            }
            catch (e_7) {
                env_7.error = e_7;
                env_7.hasError = true;
            }
            finally {
                __disposeResources(env_7);
            }
        });
        it('returns false when the pid file points to a dead process', async () => {
            const env_8 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_8, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                const child = spawn(process.execPath, ['--version'], { stdio: 'ignore' });
                await once(child, 'exit');
                assert.ok(child.pid);
                // In theory the OS could reuse the pid between the child exiting and
                // this check, but pid reuse within milliseconds is practically
                // impossible on all supported platforms.
                writePidFile(SESSION_ID, `${child.pid}\n`);
                assert.strictEqual(isDaemonRunning(SESSION_ID), false);
            }
            catch (e_8) {
                env_8.error = e_8;
                env_8.hasError = true;
            }
            finally {
                __disposeResources(env_8);
            }
        });
        it('returns false when the pid file contains 0', () => {
            const env_9 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_9, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                // Important: signaling pid 0 would target the whole process group, so
                // isDaemonRunning must not treat it as a live daemon.
                writePidFile(SESSION_ID, '0');
                assert.strictEqual(isDaemonRunning(SESSION_ID), false);
            }
            catch (e_9) {
                env_9.error = e_9;
                env_9.hasError = true;
            }
            finally {
                __disposeResources(env_9);
            }
        });
        it('returns false for non-numeric pid files', () => {
            const env_10 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_10, createTempDir('cdm-daemon-utils-test-'), false);
                process.env['XDG_RUNTIME_DIR'] = tempDir.path;
                writePidFile(SESSION_ID, 'garbage');
                assert.strictEqual(isDaemonRunning(SESSION_ID), false);
            }
            catch (e_10) {
                env_10.error = e_10;
                env_10.hasError = true;
            }
            finally {
                __disposeResources(env_10);
            }
        });
    });
});
//# sourceMappingURL=utils.test.js.map