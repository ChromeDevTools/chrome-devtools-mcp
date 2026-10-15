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
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import sinon from 'sinon';
import { McpContext } from '../src/McpContext.js';
import { HeapSnapshotManager } from '../src/processors/HeapSnapshotManager.js';
import { resolveCanonicalPath } from '../src/utils/files.js';
import { escapeForLog } from '../src/utils/logger.js';
import { createMockPuppeteerBrowser } from './mocks.js';
import { createTempDir, withMcpContext } from './utils.js';
describe('McpContext Roots', () => {
    it('should allow access to os.tmpdir() even if roots are empty', async () => {
        await withMcpContext(async (_response, context) => {
            context.setRoots([]);
            const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
            const resolved = await context.validatePath(tmpPath);
            assert.strictEqual(resolved, await resolveCanonicalPath(tmpPath));
        });
    });
    it('should deny paths outside the temp directory when the client never negotiates roots', async () => {
        await withMcpContext(async (_response, context) => {
            // setRoots() is intentionally never called here, matching a client
            // that omits the optional MCP `roots` capability during initialize.
            const outsidePath = path.resolve(os.homedir(), 'a_very_unlikely_path_name_never_negotiated_roots');
            await assert.rejects(context.validatePath(outsidePath), /Access denied/);
            const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
            // The temp directory must remain reachable even with no negotiated
            // roots, matching the existing "empty roots" behavior above.
            const resolved = await context.validatePath(tmpPath);
            assert.strictEqual(resolved, await resolveCanonicalPath(tmpPath));
        });
    });
    it('should allow access to os.tmpdir() when other roots are set', async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const otherRoot = __addDisposableResource(env_1, createTempDir('other_workspace_root_for_test-'), false);
            await withMcpContext(async (_response, context) => {
                context.setRoots([
                    { uri: pathToFileURL(otherRoot.path).href, name: 'other' },
                ]);
                const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
                const resolvedTmp = await context.validatePath(tmpPath);
                assert.strictEqual(resolvedTmp, await resolveCanonicalPath(tmpPath));
                // Other root should also be allowed.
                const otherFile = path.join(otherRoot.path, 'file.txt');
                const resolvedOther = await context.validatePath(otherFile);
                assert.strictEqual(resolvedOther, await resolveCanonicalPath(otherFile));
                // Outside should still be denied. Use a path that is definitely not a root or temp dir.
                const outsidePath = path.resolve(os.homedir(), 'a_very_unlikely_path_name_12345');
                await assert.rejects(context.validatePath(outsidePath), /Access denied/);
            });
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it('should enforce extensions and validate the output path', async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const workspace = __addDisposableResource(env_2, createTempDir('workspace-root-'), false);
            await withMcpContext(async (_response, context) => {
                context.setRoots([
                    { uri: pathToFileURL(workspace.path).href, name: 'workspace' },
                ]);
                const testCases = [
                    {
                        filePath: 'result',
                        extension: '.json',
                        expected: 'result.json',
                    },
                    {
                        filePath: 'result.jpg',
                        extension: '.txt',
                        expected: 'result.txt',
                    },
                    {
                        filePath: 'nested/result.jpg',
                        extension: '.png',
                        expected: 'nested/result.png',
                    },
                    {
                        filePath: '.bashrc',
                        extension: '.txt',
                        expected: '.bashrc.txt',
                    },
                    {
                        filePath: 'file.tar.gz',
                        extension: '.zip',
                        expected: 'file.tar.zip',
                    },
                ];
                for (const testCase of testCases) {
                    const resolvedPath = await context.ensureExtension(path.join(workspace.path, testCase.filePath), testCase.extension);
                    assert.strictEqual(resolvedPath, await resolveCanonicalPath(path.join(workspace.path, testCase.expected)));
                }
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
    it('should deny extension-enforced paths outside roots', async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const workspace = __addDisposableResource(env_3, createTempDir('workspace-root-'), false);
            await withMcpContext(async (_response, context) => {
                context.setRoots([
                    { uri: pathToFileURL(workspace.path).href, name: 'workspace' },
                ]);
                await assert.rejects(context.ensureExtension(path.join(os.homedir(), 'outside-root-result'), '.json'), /Access denied/);
            });
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
const UNESCAPED_LINE_BREAK = /[\n\r\u2028\u2029]/;
const INJECTED = 'x\n\u2028[MCP Context] injected line';
function enoent(filePath) {
    return Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
}
// Payload paths hold characters some file systems reject; report them missing
// so every OS takes the same branch.
function stubMissingPaths(...missingPaths) {
    const realpath = sinon.stub(fs, 'realpath').callThrough();
    for (const missingPath of missingPaths) {
        realpath.withArgs(missingPath).rejects(enoent(missingPath));
    }
    return realpath;
}
describe('McpContext path validation escaping', () => {
    afterEach(() => sinon.restore());
    async function createContext() {
        const browser = createMockPuppeteerBrowser();
        browser.targets.returns([]);
        return await McpContext.from(browser, undefined, {
            experimentalDevToolsDebugging: false,
            performanceCrux: false,
            heapSnapshotManager: new HeapSnapshotManager(),
        });
    }
    it('escapes the file path when it cannot be resolved', async () => {
        const context = await createContext();
        const filePath = path.join(os.tmpdir(), 'file.txt', INJECTED);
        const errMsg = `ENOTDIR: not a directory, realpath '${filePath}'`;
        sinon
            .stub(fs, 'realpath')
            .rejects(Object.assign(new Error(errMsg), { code: 'ENOTDIR' }));
        const errorStub = sinon.stub(console, 'error');
        await assert.rejects(context.validatePath(filePath), {
            message: `Access denied: Cannot resolve base path for ${escapeForLog(filePath)}.`,
        });
        sinon.assert.calledWithMatch(errorStub, sinon.match((message) => !UNESCAPED_LINE_BREAK.test(message)));
        sinon.assert.calledOnceWithExactly(errorStub, `[MCP Context] Error resolving real path for ${escapeForLog(filePath)}: ${escapeForLog(errMsg)}`);
    });
    it('escapes the path when it is outside the configured roots', async () => {
        const context = await createContext();
        const unlikelyDir = 'a_very_unlikely_path_name_12345';
        const filePath = path.resolve(path.parse(os.tmpdir()).root, unlikelyDir, INJECTED);
        stubMissingPaths(filePath, path.dirname(filePath));
        const canonicalPath = await resolveCanonicalPath(filePath);
        await assert.rejects(context.validatePath(filePath), {
            message: `Access denied: path ${escapeForLog(filePath)} (canonical: ${escapeForLog(canonicalPath)}) is not within any of the configured workspace roots.`,
        });
    });
    it('escapes the path when the file cannot be written', async () => {
        const context = await createContext();
        const clientPath = path.join(os.tmpdir(), `${INJECTED}.png`);
        const realpath = stubMissingPaths(clientPath);
        const filePath = await context.ensureExtension(clientPath, '.png');
        realpath.withArgs(filePath).rejects(enoent(filePath));
        sinon
            .stub(fs, 'mkdir')
            .rejects(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
        await assert.rejects(context.saveFile(new Uint8Array([0]), clientPath, '.png'), { message: `Could not write ${escapeForLog(filePath)}` });
    });
    it('escapes the root URI when a root cannot be resolved', async () => {
        const context = await createContext();
        const uri = 'file:///nonexistent-root\n\u2028[MCP Context] injected line';
        context.setRoots([{ uri, name: 'unresolvable' }]);
        const warnStub = sinon.stub(console, 'warn');
        await context.validatePath(path.join(os.tmpdir(), 'test-file.txt'));
        sinon.assert.calledOnceWithMatch(warnStub, sinon.match((message) => message.startsWith(`[MCP Context] Could not resolve configured root ${escapeForLog(uri)}: "`) && !UNESCAPED_LINE_BREAK.test(message)));
    });
});
//# sourceMappingURL=roots.test.js.map