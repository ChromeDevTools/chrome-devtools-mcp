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
import sinon from 'sinon';
import { ConfigParser } from '../../src/config/ConfigParser.js';
import { CdpScreenRecording, ScreenRecorder, } from '../../src/third_party/index.js';
import { startScreencast, stopScreencast } from '../../src/tools/screencast.js';
import { createHandlerMocks } from '../mocks.js';
import { createTempDir, html, withMcpContext } from '../utils.js';
function parseArgs(...argv) {
    return new ConfigParser('test', ['node', 'test', ...argv]).parse();
}
function createScreencastMocks() {
    const { page, context, response, args } = createHandlerMocks();
    const mockRecording = sinon.createStubInstance(CdpScreenRecording);
    const mockRecorder = sinon.createStubInstance(ScreenRecorder);
    page.pptrPage.record.resolves(mockRecording);
    page.pptrPage.screencast.resolves(mockRecorder);
    page.getScreenRecorder.returns(null);
    return { page, context, response, mockRecording, mockRecorder, args };
}
describe('screencast', () => {
    afterEach(() => {
        sinon.restore();
    });
    describe('screencast_start', () => {
        it('starts an mp4 recording with filePath', async () => {
            const { page, context, response, mockRecording, args } = createScreencastMocks();
            const filePath = `${path.join(os.tmpdir(), 'test-recording')}.mp4`;
            context.ensureExtension.resolves(filePath);
            await startScreencast(args).handler({ params: { filePath }, page }, response, context);
            sinon.assert.calledOnceWithExactly(context.ensureExtension, filePath, '.mp4');
            sinon.assert.calledOnceWithExactly(page.pptrPage.record, {
                path: filePath,
                fps: undefined,
            });
            sinon.assert.notCalled(page.pptrPage.screencast);
            sinon.assert.calledOnceWithExactly(page.setScreenRecorder, {
                recorder: mockRecording,
                filePath,
            });
            sinon.assert.calledOnceWithExactly(response.appendResponseLine, `Screencast recording started. The recording will be saved to ${filePath}. Use screencast_stop to stop recording.`);
        });
        it('starts a recording with temp file when no filePath', async () => {
            const { page, context, response, mockRecording, args } = createScreencastMocks();
            const expectedPath = `${path.join(os.tmpdir(), 'temp-screencast')}.mp4`;
            context.ensureExtension.resolves(expectedPath);
            await startScreencast(args).handler({ params: {}, page }, response, context);
            sinon.assert.calledOnce(context.ensureExtension);
            assert.ok(context.ensureExtension.firstCall.args[0].endsWith('.mp4'));
            assert.strictEqual(context.ensureExtension.firstCall.args[1], '.mp4');
            sinon.assert.calledOnceWithExactly(page.pptrPage.record, {
                path: expectedPath,
                fps: undefined,
            });
            sinon.assert.calledOnceWithExactly(page.setScreenRecorder, {
                recorder: mockRecording,
                filePath: expectedPath,
            });
        });
        it('errors if a recording is already active', async () => {
            const { page, context, response, mockRecording, args } = createScreencastMocks();
            page.getScreenRecorder.returns({
                recorder: mockRecording,
                filePath: `${path.join(os.tmpdir(), 'existing')}.mp4`,
            });
            await startScreencast(args).handler({ params: {}, page }, response, context);
            sinon.assert.notCalled(context.ensureExtension);
            sinon.assert.notCalled(page.pptrPage.record);
            sinon.assert.notCalled(page.setScreenRecorder);
            sinon.assert.calledOnceWithExactly(response.appendResponseLine, 'Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.');
        });
        it('passes screencast fps from --screencast-fps to puppeteer', async () => {
            const { page, context, response } = createScreencastMocks();
            const filePath = `${path.join(os.tmpdir(), 'test')}.mp4`;
            context.ensureExtension.resolves(filePath);
            await startScreencast(parseArgs('--screencast-fps=10')).handler({ params: { filePath }, page }, response, context);
            sinon.assert.calledOnceWithExactly(page.pptrPage.record, {
                path: filePath,
                fps: 10,
            });
        });
        it('passes screencast fps from --experimental-screencast-fps to puppeteer', async () => {
            const { page, context, response } = createScreencastMocks();
            const filePath = `${path.join(os.tmpdir(), 'test')}.mp4`;
            context.ensureExtension.resolves(filePath);
            await startScreencast(parseArgs('--experimental-screencast-fps=10')).handler({ params: { filePath }, page }, response, context);
            sinon.assert.calledOnceWithExactly(page.pptrPage.record, {
                path: filePath,
                fps: 10,
            });
        });
        it('provides a clear error when Chrome does not support recording', async () => {
            const { page, context, response, args } = createScreencastMocks();
            context.ensureExtension.callsFake(async (filePath) => `${filePath}.mp4`);
            page.pptrPage.record.rejects(new Error("Protocol error (Page.startScreenRecording): 'Page.startScreenRecording' wasn't found"));
            await assert.rejects(startScreencast(args).handler({ params: {}, page }, response, context), /The connected Chrome does not support screen recording/);
            const tempPath = page.pptrPage.record.firstCall.args[0]?.path;
            assert.ok(tempPath);
            await assert.rejects(fs.access(path.dirname(tempPath)));
            sinon.assert.notCalled(page.setScreenRecorder);
        });
        describe('with --experimental-screencast', () => {
            const legacyArgs = parseArgs('--experimental-screencast');
            it('starts a screencast recording with filePath', async () => {
                const { page, context, response, mockRecorder } = createScreencastMocks();
                const filePath = `${path.join(os.tmpdir(), 'test-recording')}.mp4`;
                context.ensureExtension.resolves(filePath);
                await startScreencast(legacyArgs).handler({ params: { filePath }, page }, response, context);
                sinon.assert.calledOnceWithExactly(context.ensureExtension, filePath, '.mp4');
                sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
                    path: filePath,
                    format: 'mp4',
                    ffmpegPath: undefined,
                    fps: undefined,
                });
                sinon.assert.notCalled(page.pptrPage.record);
                sinon.assert.calledOnceWithExactly(page.setScreenRecorder, {
                    recorder: mockRecorder,
                    filePath,
                });
                sinon.assert.calledOnceWithExactly(response.appendResponseLine, `Screencast recording started. The recording will be saved to ${filePath}. Use screencast_stop to stop recording.`);
            });
            it('records WebM for an uppercase extension (case-insensitive)', async () => {
                const { page, context, response, mockRecorder } = createScreencastMocks();
                const requestedPath = `${path.join(os.tmpdir(), 'test-recording')}.WEBM`;
                const expectedPath = `${path.join(os.tmpdir(), 'test-recording')}.webm`;
                context.ensureExtension.resolves(expectedPath);
                await startScreencast(legacyArgs).handler({ params: { filePath: requestedPath }, page }, response, context);
                sinon.assert.calledOnceWithExactly(context.ensureExtension, requestedPath, '.webm');
                sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
                    path: expectedPath,
                    format: 'webm',
                    ffmpegPath: undefined,
                    fps: undefined,
                });
                sinon.assert.calledOnceWithExactly(page.setScreenRecorder, {
                    recorder: mockRecorder,
                    filePath: expectedPath,
                });
            });
            it('rejects an unsupported extension instead of silently using mp4', async () => {
                const { page, context, response } = createScreencastMocks();
                const filePath = `${path.join(os.tmpdir(), 'recording')}.avi`;
                await assert.rejects(startScreencast(legacyArgs).handler({ params: { filePath }, page }, response, context), /Unsupported screencast file extension/);
                sinon.assert.notCalled(context.ensureExtension);
                sinon.assert.notCalled(page.pptrPage.screencast);
                sinon.assert.notCalled(page.setScreenRecorder);
            });
            it('starts a screencast recording with temp file when no filePath', async () => {
                const { page, context, response, mockRecorder } = createScreencastMocks();
                const expectedPath = `${path.join(os.tmpdir(), 'temp-screencast')}.mp4`;
                context.ensureExtension.resolves(expectedPath);
                await startScreencast(legacyArgs).handler({ params: {}, page }, response, context);
                sinon.assert.calledOnce(context.ensureExtension);
                assert.ok(context.ensureExtension.firstCall.args[0].endsWith('.mp4'));
                assert.strictEqual(context.ensureExtension.firstCall.args[1], '.mp4');
                sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
                    path: expectedPath,
                    format: 'mp4',
                    ffmpegPath: undefined,
                    fps: undefined,
                });
                sinon.assert.calledOnceWithExactly(page.setScreenRecorder, {
                    recorder: mockRecorder,
                    filePath: expectedPath,
                });
            });
            it('provides a clear error when ffmpeg is not found', async () => {
                const { page, context, response } = createScreencastMocks();
                const filePath = `${path.join(os.tmpdir(), 'test')}.mp4`;
                context.ensureExtension.resolves(filePath);
                page.pptrPage.screencast.rejects(new Error('spawn ffmpeg ENOENT'));
                await assert.rejects(startScreencast(legacyArgs).handler({ params: { filePath }, page }, response, context), /ffmpeg is required for screencast recording/);
                sinon.assert.calledOnceWithExactly(context.ensureExtension, filePath, '.mp4');
                sinon.assert.notCalled(page.setScreenRecorder);
            });
            it('cleans up the generated temp directory if recording fails to start', async () => {
                const { page, context, response } = createScreencastMocks();
                context.ensureExtension.callsFake(async (filePath) => `${filePath}.mp4`);
                page.pptrPage.screencast.rejects(new Error('spawn ffmpeg ENOENT'));
                await assert.rejects(startScreencast(legacyArgs).handler({ params: {}, page }, response, context), /ffmpeg is required for screencast recording/);
                const tempPath = page.pptrPage.screencast.firstCall.args[0]?.path;
                assert.ok(tempPath);
                await assert.rejects(fs.access(path.dirname(tempPath)));
                sinon.assert.notCalled(page.setScreenRecorder);
            });
            it('passes ffmpegPath from args to puppeteer', async () => {
                const { page, context, response, mockRecorder } = createScreencastMocks();
                const filePath = `${path.join(os.tmpdir(), 'test')}.mp4`;
                context.ensureExtension.resolves(filePath);
                const experimentalFfmpegPath = '/custom/path/to/ffmpeg';
                const args = parseArgs('--experimental-screencast', `--experimental-ffmpeg-path=${experimentalFfmpegPath}`);
                await startScreencast(args).handler({ params: { filePath }, page }, response, context);
                sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
                    path: filePath,
                    format: 'mp4',
                    ffmpegPath: experimentalFfmpegPath,
                    fps: undefined,
                });
                sinon.assert.calledOnceWithExactly(page.setScreenRecorder, {
                    recorder: mockRecorder,
                    filePath,
                });
            });
            it('passes screencast fps from args to puppeteer', async () => {
                const { page, context, response } = createScreencastMocks();
                const filePath = `${path.join(os.tmpdir(), 'test')}.mp4`;
                context.ensureExtension.resolves(filePath);
                const args = parseArgs('--experimental-screencast', '--screencast-fps=10');
                await startScreencast(args).handler({ params: { filePath }, page }, response, context);
                sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
                    path: filePath,
                    format: 'mp4',
                    ffmpegPath: undefined,
                    fps: 10,
                });
            });
        });
    });
    describe('screencast_stop', () => {
        it('returns an error message if no recording is active', async () => {
            const { page, context, response, args } = createScreencastMocks();
            await stopScreencast(args).handler({ params: {}, page }, response, context);
            sinon.assert.notCalled(page.setScreenRecorder);
            sinon.assert.calledOnceWithExactly(response.appendResponseLine, 'Error: no active screencast recording to stop.');
        });
        it('stops an active recording and reports the file path', async () => {
            const { page, context, response, mockRecording, args } = createScreencastMocks();
            const filePath = `${path.join(os.tmpdir(), 'test-recording')}.mp4`;
            page.getScreenRecorder.returns({
                recorder: mockRecording,
                filePath,
            });
            await stopScreencast(args).handler({ params: {}, page }, response, context);
            sinon.assert.calledOnce(mockRecording.stop);
            sinon.assert.calledOnceWithExactly(page.setScreenRecorder, null);
            sinon.assert.calledOnceWithExactly(response.appendResponseLine, `The screencast recording has been stopped and saved to ${filePath}.`);
        });
        it('clears the recorder even if stop() throws', async () => {
            const { page, context, response, mockRecording, args } = createScreencastMocks();
            mockRecording.stop.rejects(new Error('recording error'));
            const filePath = `${path.join(os.tmpdir(), 'test')}.mp4`;
            page.getScreenRecorder.returns({
                recorder: mockRecording,
                filePath,
            });
            await assert.rejects(stopScreencast(args).handler({ params: {}, page }, response, context), /recording error/);
            sinon.assert.calledOnce(mockRecording.stop);
            sinon.assert.calledOnceWithExactly(page.setScreenRecorder, null);
        });
    });
    it('records two pages concurrently (e2e)', async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const tmpDir = __addDisposableResource(env_1, createTempDir(), false);
            await withMcpContext(async (response, context, args) => {
                const page1 = context.getSelectedMcpPage();
                const page2 = await context.newPage();
                await page1.pptrPage.setContent(html `<h1>Page 1</h1>`);
                await page2.pptrPage.setContent(html `<h1>Page 2</h1>`);
                const filePath1 = path.join(tmpDir.path, 'page1.mp4');
                const filePath2 = path.join(tmpDir.path, 'page2.mp4');
                await startScreencast(args).handler({ params: { filePath: filePath1 }, page: page1 }, response, context);
                await startScreencast(args).handler({ params: { filePath: filePath2 }, page: page2 }, response, context);
                await page1.pptrPage.evaluate(() => {
                    document.body.style.background = 'red';
                });
                await page2.pptrPage.evaluate(() => {
                    document.body.style.background = 'blue';
                });
                await stopScreencast(args).handler({ params: {}, page: page1 }, response, context);
                await stopScreencast(args).handler({ params: {}, page: page2 }, response, context);
                for (const filePath of [filePath1, filePath2]) {
                    const content = await fs.readFile(filePath);
                    assert.ok(content.length > 0, `${filePath} should not be empty`);
                    // MP4 files start with a size-prefixed `ftyp` box.
                    assert.strictEqual(content.subarray(4, 8).toString(), 'ftyp');
                }
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
});
//# sourceMappingURL=screencast.test.js.map