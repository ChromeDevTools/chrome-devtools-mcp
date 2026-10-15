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
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it, afterEach, beforeEach } from 'node:test';
import sinon from 'sinon';
import { ClearcutLogger } from '../../src/telemetry/ClearcutLogger.js';
import { ErrorCode } from '../../src/telemetry/errors.js';
import * as persistence from '../../src/telemetry/persistence.js';
import { WatchdogClient } from '../../src/telemetry/WatchdogClient.js';
import { createTempDir } from '../utils.js';
describe('FilePersistence', () => {
    let logServerErrorStub;
    beforeEach(async () => {
        ClearcutLogger.resetForTesting();
        const mockWatchdog = sinon.createStubInstance(WatchdogClient);
        const mockPersistence = sinon.createStubInstance(persistence.FilePersistence);
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
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_1, createTempDir('telemetry-test-'), false);
                const filePersistence = new persistence.FilePersistence(tmpDir.path);
                const state = await filePersistence.loadState();
                assert.deepStrictEqual(state, {});
                sinon.assert.notCalled(logServerErrorStub);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        });
        it('returns default state and LOGS telemetry if load fails due to corruption', async () => {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_2, createTempDir('telemetry-test-'), false);
                const filePath = path.join(tmpDir.path, 'telemetry_state.json');
                await fs.writeFile(filePath, 'not-valid-json', 'utf-8');
                const filePersistence = new persistence.FilePersistence(tmpDir.path);
                const state = await filePersistence.loadState();
                assert.deepStrictEqual(state, {});
                sinon.assert.calledOnceWithExactly(logServerErrorStub, {
                    errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
                });
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        });
        it('returns default state and LOGS telemetry if load fails during read stage', async () => {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_3, createTempDir('telemetry-test-'), false);
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
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                __disposeResources(env_3);
            }
        });
        it('returns default state and LOGS telemetry if state file is empty', async () => {
            const env_4 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_4, createTempDir('telemetry-test-'), false);
                const filePath = path.join(tmpDir.path, 'telemetry_state.json');
                await fs.writeFile(filePath, '', 'utf-8');
                const filePersistence = new persistence.FilePersistence(tmpDir.path);
                const state = await filePersistence.loadState();
                assert.deepStrictEqual(state, {});
                sinon.assert.calledOnceWithExactly(logServerErrorStub, {
                    errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
                });
            }
            catch (e_4) {
                env_4.error = e_4;
                env_4.hasError = true;
            }
            finally {
                __disposeResources(env_4);
            }
        });
        it('returns default state if lastActive is invalid date string', async () => {
            const env_5 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_5, createTempDir('telemetry-test-'), false);
                const filePath = path.join(tmpDir.path, 'telemetry_state.json');
                await fs.writeFile(filePath, JSON.stringify({ lastActive: 'invalid-date' }), 'utf-8');
                const filePersistence = new persistence.FilePersistence(tmpDir.path);
                const state = await filePersistence.loadState();
                assert.deepStrictEqual(state, {});
                sinon.assert.notCalled(logServerErrorStub);
            }
            catch (e_5) {
                env_5.error = e_5;
                env_5.hasError = true;
            }
            finally {
                __disposeResources(env_5);
            }
        });
        it('returns default state if lastToolCall is invalid date string', async () => {
            const env_6 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_6, createTempDir('telemetry-test-'), false);
                const filePath = path.join(tmpDir.path, 'telemetry_state.json');
                await fs.writeFile(filePath, JSON.stringify({
                    lastActive: '2023-01-01T00:00:00.000Z',
                    lastToolCall: 'invalid-date',
                }), 'utf-8');
                const filePersistence = new persistence.FilePersistence(tmpDir.path);
                const state = await filePersistence.loadState();
                assert.deepStrictEqual(state, {});
                sinon.assert.notCalled(logServerErrorStub);
            }
            catch (e_6) {
                env_6.error = e_6;
                env_6.hasError = true;
            }
            finally {
                __disposeResources(env_6);
            }
        });
        it('returns stored state if file exists', async () => {
            const env_7 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_7, createTempDir('telemetry-test-'), false);
                const expectedState = {
                    lastActive: '2023-01-01T00:00:00.000Z',
                    lastToolCall: '2023-01-01T12:00:00.000Z',
                };
                await fs.writeFile(path.join(tmpDir.path, 'telemetry_state.json'), JSON.stringify(expectedState));
                const filePersistence = new persistence.FilePersistence(tmpDir.path);
                const state = await filePersistence.loadState();
                assert.deepStrictEqual(state, expectedState);
            }
            catch (e_7) {
                env_7.error = e_7;
                env_7.hasError = true;
            }
            finally {
                __disposeResources(env_7);
            }
        });
    });
    describe('saveState', () => {
        it('saves state to file', async () => {
            const env_8 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_8, createTempDir('telemetry-test-'), false);
                const state = {
                    lastActive: '2023-01-01T00:00:00.000Z',
                    lastToolCall: '2023-01-01T12:00:00.000Z',
                };
                const filePersistence = new persistence.FilePersistence(tmpDir.path);
                await filePersistence.saveState(state);
                const content = await fs.readFile(path.join(tmpDir.path, 'telemetry_state.json'), 'utf-8');
                assert.deepStrictEqual(JSON.parse(content), state);
                sinon.assert.notCalled(logServerErrorStub);
            }
            catch (e_8) {
                env_8.error = e_8;
                env_8.hasError = true;
            }
            finally {
                __disposeResources(env_8);
            }
        });
        it('logs telemetry when failing to save to file', async () => {
            const env_9 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_9, createTempDir('telemetry-test-'), false);
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
            }
            catch (e_9) {
                env_9.error = e_9;
                env_9.hasError = true;
            }
            finally {
                __disposeResources(env_9);
            }
        });
    });
});
//# sourceMappingURL=persistence.test.js.map