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
import crypto from 'node:crypto';
import path from 'node:path';
import { describe, it, afterEach, beforeEach } from 'node:test';
import { assertDaemonIsNotRunning, assertDaemonIsRunning, createTempDir, createTempFile, runCli, } from '../utils.js';
describe('chrome-devtools', () => {
    let sessionId;
    beforeEach(async () => {
        sessionId = crypto.randomUUID();
        await runCli(['stop'], sessionId);
        await assertDaemonIsNotRunning(sessionId);
    });
    afterEach(async () => {
        await runCli(['stop'], sessionId);
        await assertDaemonIsNotRunning(sessionId);
    });
    it('can start and stop the daemon', async () => {
        await assertDaemonIsNotRunning(sessionId);
        const startResult = await runCli(['start'], sessionId);
        assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
        await assertDaemonIsRunning(sessionId);
        const stopResult = await runCli(['stop'], sessionId);
        assert.strictEqual(stopResult.status, 0, `stop command failed: ${stopResult.stderr}`);
        await assertDaemonIsNotRunning(sessionId);
    });
    it('can start the daemon with userDataDir', async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const userDataDir = __addDisposableResource(env_1, createTempDir('chrome-devtools-test-'), false);
            const startResult = await runCli(['start', '--userDataDir', userDataDir.path], sessionId);
            assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
            assert.ok(!startResult.stderr.includes('Arguments userDataDir and isolated are mutually exclusive'), `unexpected conflict error: ${startResult.stderr}`);
            await assertDaemonIsRunning(sessionId);
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it('forwards an explicit headless=false option', async () => {
        const startResult = await runCli(['start', '--headless=false'], sessionId);
        assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
        const statusResult = await runCli(['status'], sessionId);
        assert.strictEqual(statusResult.status, 0);
        assert.ok(statusResult.stdout.includes('--no-headless'), `headless=false was not forwarded: ${statusResult.stdout}`);
    });
    it('can start the daemon with a workspace', async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const workspace = __addDisposableResource(env_2, createTempDir('chrome-devtools-workspace-'), false);
            const startResult = await runCli(['start', '--workspace', workspace.path], sessionId);
            assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
            const statusResult = await runCli(['status'], sessionId);
            assert.strictEqual(statusResult.status, 0);
            assert.ok(statusResult.stdout.includes('--filesystem-root=') &&
                statusResult.stdout.includes(path.basename(workspace.path)), `workspace was not forwarded: ${statusResult.stdout}`);
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it('can start the daemon with a config file', async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const userDataDir = __addDisposableResource(env_3, createTempDir('chrome-devtools-config-profile-'), false);
            const configFile = __addDisposableResource(env_3, createTempFile(JSON.stringify({
                userDataDir: userDataDir.path,
                headless: true,
            }), 'chrome-devtools-config.json'), false);
            const relativeConfigPath = path.relative(process.cwd(), configFile.path);
            const startResult = await runCli(['start', '--config', relativeConfigPath], sessionId);
            assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
            const statusResult = await runCli(['status'], sessionId);
            assert.strictEqual(statusResult.status, 0);
            assert.ok(statusResult.stdout.includes(JSON.stringify(`--config=${configFile.path}`)), `resolved config path was not forwarded: ${statusResult.stdout}`);
            assert.ok(!statusResult.stdout.includes('--headless'), `default --headless should not be forwarded when not specified on CLI: ${statusResult.stdout}`);
            assert.ok(!statusResult.stdout.includes('--filesystem-root'), `default --filesystem-root should not be forwarded when not specified on CLI: ${statusResult.stdout}`);
            const overrideResult = await runCli(['start', '--config', relativeConfigPath, '--headless'], sessionId);
            assert.strictEqual(overrideResult.status, 0, `start command with --headless override failed: ${overrideResult.stderr}`);
            const overrideStatusResult = await runCli(['status'], sessionId);
            assert.strictEqual(overrideStatusResult.status, 0);
            assert.ok(overrideStatusResult.stdout.includes('"--headless"'), `explicit --headless CLI flag was not forwarded: ${overrideStatusResult.stdout}`);
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
});
//# sourceMappingURL=chrome-devtools-start-stop.test.js.map