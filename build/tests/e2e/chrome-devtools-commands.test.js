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
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { assertDaemonIsRunning, createCliSession, createTempDir, runCli, stopDaemonForCleanup, } from '../utils.js';
// Each test uses its own daemon session, so the tests run in parallel.
describe('chrome-devtools', { concurrency: true }, () => {
    it('can invoke list_pages', async (t) => {
        const sessionId = createCliSession(t);
        const startResult = await runCli(['start'], sessionId);
        assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
        const listPagesResult = await runCli(['list_pages'], sessionId);
        assert.strictEqual(listPagesResult.status, 0, `list_pages command failed: ${listPagesResult.stderr}`);
        assert(listPagesResult.stdout.includes('about:blank'), 'list_pages output is unexpected');
        await assertDaemonIsRunning(sessionId);
    });
    it('can take screenshot', async (t) => {
        const sessionId = createCliSession(t);
        const startResult = await runCli(['start'], sessionId);
        assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
        const result = await runCli(['take_screenshot', '1'], sessionId);
        assert.strictEqual(result.status, 0, `take_screenshot command failed: ${result.stderr}`);
        assert(result.stdout.includes('.png'), 'take_screenshot output is unexpected');
    });
    it('can evaluate inline and local JavaScript', async (t) => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const sessionId = createCliSession(t);
            const rootDirectory = __addDisposableResource(env_1, createTempDir('evaluate-script-cli-'), false);
            const daemonDirectory = path.join(rootDirectory.path, 'daemon');
            const clientDirectory = path.join(rootDirectory.path, 'client');
            await fs.mkdir(daemonDirectory);
            await fs.mkdir(clientDirectory);
            const sourcePath = path.join(clientDirectory, 'script.js');
            const outputPath = path.join(clientDirectory, 'result.json');
            await fs.writeFile(sourcePath, 'document.title = "Local script"; document.title', 'utf8');
            try {
                const startResult = await runCli(['start'], sessionId, {
                    cwd: daemonDirectory,
                });
                assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
                // The three evaluations do not depend on each other, so they run in
                // parallel.
                const [inlineResult, fileResult, fileUrlResult] = await Promise.all([
                    runCli(['evaluate_script', '() => 6 * 7', '--pageId', '1'], sessionId, {
                        cwd: clientDirectory,
                    }),
                    runCli([
                        'evaluate_script',
                        '--pageId',
                        '1',
                        '--sourcePath',
                        sourcePath,
                        '--format',
                        'script',
                        '--filePath',
                        outputPath,
                    ], sessionId, { cwd: clientDirectory }),
                    runCli([
                        'evaluate_script',
                        '--pageId',
                        '1',
                        '--sourcePath',
                        pathToFileURL(sourcePath).href,
                        '--format',
                        'script',
                    ], sessionId, { cwd: clientDirectory }),
                ]);
                assert.strictEqual(inlineResult.status, 0, `inline evaluation failed: ${inlineResult.stderr}`);
                assert.match(inlineResult.stdout, /\b42\b/);
                assert.strictEqual(fileResult.status, 0, `file evaluation failed: ${fileResult.stderr}`);
                assert.strictEqual(JSON.parse(await fs.readFile(outputPath, 'utf8')), 'Local script');
                assert.strictEqual(fileUrlResult.status, 0, `file URL evaluation failed: ${fileUrlResult.stderr}`);
                assert.match(fileUrlResult.stdout, /Local script/);
            }
            finally {
                // Stop the daemon before the temporary directory, its working
                // directory, is removed.
                await stopDaemonForCleanup(sessionId);
            }
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
});
//# sourceMappingURL=chrome-devtools-commands.test.js.map