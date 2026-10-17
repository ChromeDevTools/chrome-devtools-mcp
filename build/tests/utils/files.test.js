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
import { describe, it } from 'node:test';
import { resolveCanonicalPath } from '../../src/utils/files.js';
import { createTempDir } from '../utils.js';
async function createSymlinkOrSkip(t, target, symlinkPath, type) {
    try {
        await fs.symlink(target, symlinkPath, type);
        return true;
    }
    catch (error) {
        if (os.platform() === 'win32' &&
            error instanceof Error &&
            'code' in error &&
            (error.code === 'EPERM' || error.code === 'EACCES')) {
            t.skip('creating symlinks requires additional privileges on Windows');
            return false;
        }
        throw error;
    }
}
describe('resolveCanonicalPath', () => {
    it('should resolve an existing standard file path', async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_1, createTempDir('resolve-canonical-test-'), false);
            const canonicalTmpDir = await fs.realpath(tmpDir.path);
            const filePath = path.join(tmpDir.path, 'test.txt');
            await fs.writeFile(filePath, 'hello');
            const resolved = await resolveCanonicalPath(filePath);
            assert.strictEqual(resolved, path.join(canonicalTmpDir, 'test.txt'));
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it('should resolve a non-existent file whose parent directory exists', async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_2, createTempDir('resolve-canonical-test-'), false);
            const canonicalTmpDir = await fs.realpath(tmpDir.path);
            const filePath = path.join(tmpDir.path, 'non-existent.txt');
            const resolved = await resolveCanonicalPath(filePath);
            assert.strictEqual(resolved, path.join(canonicalTmpDir, 'non-existent.txt'));
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it('should resolve a non-existent deeply nested file whose parent directories do not exist', async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_3, createTempDir('resolve-canonical-test-'), false);
            const canonicalTmpDir = await fs.realpath(tmpDir.path);
            const filePath = path.join(tmpDir.path, 'nested1', 'nested2', 'non-existent.txt');
            const resolved = await resolveCanonicalPath(filePath);
            assert.strictEqual(resolved, path.join(canonicalTmpDir, 'nested1', 'nested2', 'non-existent.txt'));
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
    it('should resolve existing files with symlinks in path', async (t) => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_4, createTempDir('resolve-canonical-test-'), false);
            const targetDir = path.join(tmpDir.path, 'target');
            await fs.mkdir(targetDir);
            const targetFile = path.join(targetDir, 'file.txt');
            await fs.writeFile(targetFile, 'hello');
            const symlinkDir = path.join(tmpDir.path, 'symlink_dir');
            const created = await createSymlinkOrSkip(t, targetDir, symlinkDir, 'dir');
            if (!created) {
                return;
            }
            const filePathWithSymlink = path.join(symlinkDir, 'file.txt');
            const resolved = await resolveCanonicalPath(filePathWithSymlink);
            const canonicalTargetDir = await fs.realpath(targetDir);
            assert.strictEqual(resolved, path.join(canonicalTargetDir, 'file.txt'));
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    it('should resolve non-existent files with symlinks in path', async (t) => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_5, createTempDir('resolve-canonical-test-'), false);
            const targetDir = path.join(tmpDir.path, 'target');
            await fs.mkdir(targetDir);
            const symlinkDir = path.join(tmpDir.path, 'symlink_dir');
            const created = await createSymlinkOrSkip(t, targetDir, symlinkDir, 'dir');
            if (!created) {
                return;
            }
            const filePathWithSymlink = path.join(symlinkDir, 'non-existent.txt');
            const resolved = await resolveCanonicalPath(filePathWithSymlink);
            const canonicalTargetDir = await fs.realpath(targetDir);
            assert.strictEqual(resolved, path.join(canonicalTargetDir, 'non-existent.txt'));
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    });
    it('should resolve dangling symlink at the end of path', async (t) => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_6, createTempDir('resolve-canonical-test-'), false);
            const canonicalTmpDir = await fs.realpath(tmpDir.path);
            const nonExistentTarget = path.join(tmpDir.path, 'non-existent-target.txt');
            const danglingSymlink = path.join(tmpDir.path, 'dangling-symlink.txt');
            const created = await createSymlinkOrSkip(t, nonExistentTarget, danglingSymlink);
            if (!created) {
                return;
            }
            const resolved = await resolveCanonicalPath(danglingSymlink);
            assert.strictEqual(resolved, path.join(canonicalTmpDir, 'dangling-symlink.txt'));
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    });
    it('should resolve path with a dangling symlink directory in the middle', async (t) => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_7, createTempDir('resolve-canonical-test-'), false);
            const canonicalTmpDir = await fs.realpath(tmpDir.path);
            const nonExistentTargetDir = path.join(tmpDir.path, 'non-existent-dir');
            const danglingSymlinkDir = path.join(tmpDir.path, 'dangling-dir');
            const created = await createSymlinkOrSkip(t, nonExistentTargetDir, danglingSymlinkDir, 'dir');
            if (!created) {
                return;
            }
            const filePath = path.join(danglingSymlinkDir, 'file.txt');
            const resolved = await resolveCanonicalPath(filePath);
            assert.strictEqual(resolved, path.join(canonicalTmpDir, 'dangling-dir', 'file.txt'));
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
//# sourceMappingURL=files.test.js.map