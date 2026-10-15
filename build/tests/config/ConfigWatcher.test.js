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
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import sinon from 'sinon';
import { ConfigWatcher } from '../../src/config/ConfigWatcher.js';
import { createTempDir } from '../utils.js';
const DEBOUNCE_MS = 50;
// Long enough for fs events to be delivered and the debounce to fire.
const SETTLE_MS = 500;
const POLL_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 20;
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function waitForCall(stub) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (!stub.called) {
        if (Date.now() >= deadline) {
            throw new Error('Timed out waiting for stub to be called');
        }
        await wait(POLL_INTERVAL_MS);
    }
}
function writeConfig(dir) {
    const configPath = path.join(dir, 'cd4a.config.json');
    fs.writeFileSync(configPath, '{}');
    return configPath;
}
/**
 * Resolves once fs events for `dir` are delivered.
 *
 * On macOS, libuv creates a single FSEvents stream per event loop on a
 * background thread, and `fs.watch` returns before the stream exists. Changes
 * made in that window are lost. The probe watcher shares the stream with the
 * ConfigWatcher, so an event for the probe file proves the stream is active.
 * The caller must keep the probe open: closing it recreates the stream.
 */
async function waitForWatchReady(dir) {
    let ready = false;
    const probe = fs.watch(dir, { persistent: false }, () => {
        ready = true;
    });
    const probePath = path.join(dir, 'probe');
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (!ready) {
        if (Date.now() >= deadline) {
            probe.close();
            throw new Error(`Timed out waiting for fs.watch on ${dir}`);
        }
        fs.writeFileSync(probePath, String(Date.now()));
        await wait(POLL_INTERVAL_MS);
    }
    return probe;
}
async function startWatcher(watchedPath, onChange = sinon.stub().resolves()) {
    const watcher = new ConfigWatcher(watchedPath, onChange, {
        debounceMs: DEBOUNCE_MS,
    });
    watcher.start();
    const probe = await waitForWatchReady(path.dirname(fs.realpathSync(watchedPath)));
    return {
        watcher,
        [Symbol.dispose]() {
            watcher.dispose();
            probe.close();
        },
    };
}
describe('ConfigWatcher', () => {
    afterEach(() => {
        sinon.restore();
    });
    it('calls onChange once for several quick writes', async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_1, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const onChange = sinon.stub().resolves();
            const watcher = __addDisposableResource(env_1, await startWatcher(configPath, onChange), false);
            fs.writeFileSync(configPath, '{"headless": true}');
            fs.writeFileSync(configPath, '{"headless": false}');
            await waitForCall(onChange);
            sinon.assert.calledOnceWithExactly(onChange);
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it('detects atomic replacements', async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_2, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const onChange = sinon.stub().resolves();
            const watcher = __addDisposableResource(env_2, await startWatcher(configPath, onChange), false);
            const tempPath = path.join(dir.path, 'cd4a.config.json.tmp');
            fs.writeFileSync(tempPath, '{"headless": true}');
            fs.renameSync(tempPath, configPath);
            await waitForCall(onChange);
            sinon.assert.calledOnceWithExactly(onChange);
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it('ignores other files in the directory', async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_3, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const onChange = sinon.stub().resolves();
            const watcher = __addDisposableResource(env_3, await startWatcher(configPath, onChange), false);
            fs.writeFileSync(path.join(dir.path, 'other.json'), '{}');
            await wait(SETTLE_MS);
            sinon.assert.notCalled(onChange);
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
    it('follows symlinks to the real config file', async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_4, createTempDir('cd4a-watcher-'), false);
            const linkDir = __addDisposableResource(env_4, createTempDir('cd4a-link-'), false);
            const configPath = writeConfig(dir.path);
            const linkPath = path.join(linkDir.path, 'cd4a.config.json');
            fs.symlinkSync(configPath, linkPath);
            const onChange = sinon.stub().resolves();
            const watcher = __addDisposableResource(env_4, await startWatcher(linkPath, onChange), false);
            fs.writeFileSync(configPath, '{"headless": true}');
            await waitForCall(onChange);
            sinon.assert.calledOnceWithExactly(onChange);
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    it('does not call onChange if the content did not change', async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_5, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const onChange = sinon.stub().resolves();
            const watcher = __addDisposableResource(env_5, await startWatcher(configPath, onChange), false);
            fs.writeFileSync(configPath, '{}');
            await wait(SETTLE_MS);
            sinon.assert.notCalled(onChange);
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    });
    it('does not call onChange when the config file cannot be read', async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_6, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const onChange = sinon.stub().resolves();
            const watcher = __addDisposableResource(env_6, await startWatcher(configPath, onChange), false);
            fs.unlinkSync(configPath);
            await wait(SETTLE_MS);
            sinon.assert.notCalled(onChange);
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    });
    it('stops calling onChange after dispose', async () => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_7, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const onChange = sinon.stub().resolves();
            const started = __addDisposableResource(env_7, await startWatcher(configPath, onChange), false);
            started.watcher.dispose();
            fs.writeFileSync(configPath, '{"headless": true}');
            await wait(SETTLE_MS);
            sinon.assert.notCalled(onChange);
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    });
    it('logs errors from onChange', async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_8, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const consoleError = sinon.stub(console, 'error');
            const error = new Error('apply failed');
            const watcher = __addDisposableResource(env_8, await startWatcher(configPath, sinon.stub().rejects(error)), false);
            fs.writeFileSync(configPath, '{"headless": true}');
            await waitForCall(consoleError);
            sinon.assert.calledOnceWithExactly(consoleError, `Failed to apply ${configPath}:`, error);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    });
    it('serializes overlapping onChange calls', async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const dir = __addDisposableResource(env_9, createTempDir('cd4a-watcher-'), false);
            const configPath = writeConfig(dir.path);
            const firstCall = Promise.withResolvers();
            const secondCall = Promise.withResolvers();
            const onChange = sinon.stub();
            onChange.onFirstCall().returns(firstCall.promise);
            onChange.onSecondCall().callsFake(async () => {
                secondCall.resolve();
            });
            const watcher = __addDisposableResource(env_9, await startWatcher(configPath, onChange), false);
            fs.writeFileSync(configPath, '{"headless": true}');
            await waitForCall(onChange);
            sinon.assert.calledOnce(onChange);
            fs.writeFileSync(configPath, '{"headless": false}');
            await wait(SETTLE_MS);
            sinon.assert.calledOnce(onChange);
            firstCall.resolve();
            await secondCall.promise;
            sinon.assert.calledTwice(onChange);
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
//# sourceMappingURL=ConfigWatcher.test.js.map