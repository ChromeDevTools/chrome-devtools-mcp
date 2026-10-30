/**
 * @license
 * Copyright 2025 Google LLC
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
import { stat, chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sinon from 'sinon';
import { TextSnapshot } from '../../src/TextSnapshot.js';
import { zod } from '../../src/third_party/index.js';
import { screenshot } from '../../src/tools/screenshot.js';
import { resolveCanonicalPath } from '../../src/utils/files.js';
import { createHandlerMocks, createMockElementHandle } from '../mocks.js';
import { screenshots } from '../snapshot.js';
import { createTempDir, html, withMcpContext } from '../utils.js';
const screenshotTool = screenshot({});
/**
 * Reads the pixel width from a PNG buffer's IHDR chunk (bytes 16..19).
 */
function pngWidth(data) {
    return data.readUInt32BE(16);
}
/**
 * Reads the pixel height from a PNG buffer's IHDR chunk (bytes 20..23).
 */
function pngHeight(data) {
    return data.readUInt32BE(20);
}
describe('screenshot', () => {
    describe('downscale clip', () => {
        for (const viewport of [{ width: 800, height: 600 }, null]) {
            const mode = viewport ? 'emulated viewport' : 'native viewport';
            it(`passes the scrolled ${mode} clip to page.screenshot`, async () => {
                const { page, context, response, args } = createHandlerMocks({
                    screenshotMaxWidth: 100,
                });
                const pptrPage = page.pptrPage;
                pptrPage.viewport.returns(viewport);
                pptrPage.evaluate.resolves({
                    x: 800,
                    y: 1000,
                    width: 1000,
                    height: 700,
                    devicePixelRatio: 2,
                });
                pptrPage.screenshot.resolves(new Uint8Array());
                await screenshot(args).handler({ params: { format: 'png' }, page }, response, context);
                sinon.assert.calledOnceWithExactly(pptrPage.screenshot, {
                    type: 'png',
                    quality: undefined,
                    optimizeForSpeed: true,
                    clip: {
                        x: 800,
                        y: 1000,
                        width: viewport ? 800 : 1000,
                        height: viewport ? 600 : 700,
                        scale: viewport ? 0.125 : 0.05,
                    },
                });
            });
            it(`adds the scroll offset to the element clip with ${mode}`, async () => {
                const { page, context, response, args } = createHandlerMocks({
                    screenshotMaxWidth: 100,
                });
                const pptrPage = page.pptrPage;
                const { handle } = createMockElementHandle();
                page.getElementByUid.resolves(handle);
                handle.boundingBox.resolves({ x: 120, y: 80, width: 400, height: 300 });
                pptrPage.viewport.returns(viewport);
                pptrPage.evaluate.resolves({ x: 800, y: 1000, devicePixelRatio: 2 });
                pptrPage.screenshot.resolves(new Uint8Array());
                await screenshot(args).handler({ params: { format: 'png', uid: '1_1' }, page }, response, context);
                sinon.assert.calledOnceWithExactly(page.getElementByUid, '1_1');
                sinon.assert.calledOnceWithExactly(pptrPage.screenshot, {
                    type: 'png',
                    quality: undefined,
                    optimizeForSpeed: true,
                    clip: {
                        x: 920,
                        y: 1080,
                        width: 400,
                        height: 300,
                        scale: viewport ? 0.25 : 0.125,
                    },
                });
                sinon.assert.notCalled(handle.screenshot);
            });
        }
        it('keeps the full-page clip at the document origin', async () => {
            const { page, context, response, args } = createHandlerMocks({
                screenshotMaxWidth: 100,
            });
            const pptrPage = page.pptrPage;
            pptrPage.evaluate.resolves({
                width: 1600,
                height: 2000,
                devicePixelRatio: 1,
            });
            pptrPage.screenshot.resolves(new Uint8Array());
            await screenshot(args).handler({ params: { format: 'png', fullPage: true }, page }, response, context);
            sinon.assert.calledOnceWithExactly(pptrPage.screenshot, {
                type: 'png',
                quality: undefined,
                optimizeForSpeed: true,
                clip: { x: 0, y: 0, width: 1600, height: 2000, scale: 0.0625 },
            });
        });
        it('uses element.screenshot when the element needs no downscaling', async () => {
            const { page, context, response, args } = createHandlerMocks({
                screenshotMaxWidth: 400,
            });
            const pptrPage = page.pptrPage;
            const { handle } = createMockElementHandle();
            page.getElementByUid.resolves(handle);
            handle.boundingBox.resolves({ x: 120, y: 80, width: 400, height: 300 });
            handle.screenshot.resolves(new Uint8Array());
            pptrPage.viewport.returns(null);
            pptrPage.evaluate.resolves({ x: 800, y: 1000, devicePixelRatio: 1 });
            await screenshot(args).handler({ params: { format: 'png', uid: '1_1' }, page }, response, context);
            sinon.assert.calledOnceWithExactly(handle.screenshot, {
                type: 'png',
                quality: undefined,
                optimizeForSpeed: true,
            });
        });
        it('warns when fullPage screenshot exceeds 16384px without downscaling', async () => {
            const { page, context, response, args } = createHandlerMocks({});
            const pptrPage = page.pptrPage;
            pptrPage.evaluate.resolves({
                width: 1200,
                height: 20000,
                devicePixelRatio: 1,
            });
            pptrPage.screenshot.resolves(new Uint8Array());
            await screenshot(args).handler({ params: { format: 'png', fullPage: true }, page }, response, context);
            sinon.assert.calledWithMatch(response.appendResponseLine, sinon.match(/exceed.*16384/i));
        });
        it('does not warn when fullPage screenshot is within 16384px', async () => {
            const { page, context, response, args } = createHandlerMocks({});
            const pptrPage = page.pptrPage;
            pptrPage.evaluate.resolves({
                width: 1200,
                height: 5000,
                devicePixelRatio: 1,
            });
            pptrPage.screenshot.resolves(new Uint8Array());
            await screenshot(args).handler({ params: { format: 'png', fullPage: true }, page }, response, context);
            sinon.assert.neverCalledWithMatch(response.appendResponseLine, sinon.match(/exceed.*16384/i));
        });
    });
    describe('browser_take_screenshot', () => {
        it('with default options', async () => {
            await withMcpContext(async (response, context) => {
                const fixture = screenshots.basic;
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setContent(fixture.html);
                await screenshotTool.handler({ params: { format: 'png' }, page: context.getSelectedMcpPage() }, response, context);
                assert.strictEqual(response.images.length, 1);
                assert.strictEqual(response.images[0].mimeType, 'image/png');
                assert.strictEqual(response.responseLines.at(0), "Took a screenshot of the current page's viewport.");
            });
        });
        it('ignores quality', async () => {
            const { page, context, response, args } = createHandlerMocks();
            page.pptrPage.screenshot.resolves(new Uint8Array([1, 2, 3]));
            await screenshot(args).handler({ params: { format: 'png', quality: 0 }, page }, response, context);
            sinon.assert.calledOnceWithExactly(page.pptrPage.screenshot, {
                type: 'png',
                fullPage: false,
                quality: undefined,
                optimizeForSpeed: true,
            });
            sinon.assert.calledOnceWithExactly(response.appendResponseLine, "Took a screenshot of the current page's viewport.");
            sinon.assert.calledOnceWithExactly(response.attachImage, {
                mimeType: 'image/png',
                data: 'AQID',
            });
        });
        it('with jpeg', async () => {
            const { page, context, response, args } = createHandlerMocks();
            page.pptrPage.screenshot.resolves(new Uint8Array([1, 2, 3]));
            await screenshot(args).handler({ params: { format: 'jpeg' }, page }, response, context);
            sinon.assert.calledOnceWithExactly(page.pptrPage.screenshot, {
                type: 'jpeg',
                fullPage: false,
                quality: undefined,
                optimizeForSpeed: true,
            });
            sinon.assert.calledOnceWithExactly(response.appendResponseLine, "Took a screenshot of the current page's viewport.");
            sinon.assert.calledOnceWithExactly(response.attachImage, {
                mimeType: 'image/jpeg',
                data: 'AQID',
            });
        });
        it('forwards the requested quality for jpeg', async () => {
            const { page, context, response, args } = createHandlerMocks();
            page.pptrPage.screenshot.resolves(new Uint8Array([1, 2, 3]));
            await screenshot(args).handler({ params: { format: 'jpeg', quality: 50 }, page }, response, context);
            sinon.assert.calledOnceWithExactly(page.pptrPage.screenshot, {
                type: 'jpeg',
                fullPage: false,
                quality: 50,
                optimizeForSpeed: true,
            });
        });
        it('with webp', async () => {
            const { page, context, response, args } = createHandlerMocks({
                screenshotQuality: 80,
            });
            page.pptrPage.screenshot.resolves(new Uint8Array([1, 2, 3]));
            await screenshot(args).handler({ params: { format: 'webp' }, page }, response, context);
            sinon.assert.calledOnceWithExactly(page.pptrPage.screenshot, {
                type: 'webp',
                fullPage: false,
                quality: 80,
                optimizeForSpeed: true,
            });
            sinon.assert.calledOnceWithExactly(response.appendResponseLine, "Took a screenshot of the current page's viewport.");
            sinon.assert.calledOnceWithExactly(response.attachImage, {
                mimeType: 'image/webp',
                data: 'AQID',
            });
        });
        it('with full page', async () => {
            await withMcpContext(async (response, context) => {
                const fixture = screenshots.viewportOverflow;
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setContent(fixture.html);
                await screenshotTool.handler({
                    params: { format: 'png', fullPage: true },
                    page: context.getSelectedMcpPage(),
                }, response, context);
                assert.strictEqual(response.images.length, 1);
                assert.strictEqual(response.images[0].mimeType, 'image/png');
                assert.strictEqual(response.responseLines.at(0), 'Took a screenshot of the full current page.');
            });
        });
        it('with full page resulting in a large screenshot', async () => {
            await withMcpContext(async (response, context) => {
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setContent(html `${`<div style="color:blue;">test</div>`.repeat(6500)}
            <div
              id="red"
              style="color:blue;"
              >test</div
            > `);
                await page.evaluate(() => {
                    const el = document.querySelector('#red');
                    return el?.scrollIntoViewIfNeeded();
                });
                await screenshotTool.handler({
                    params: { format: 'png', fullPage: true },
                    page: context.getSelectedMcpPage(),
                }, response, context);
                assert.strictEqual(response.images.length, 0);
                assert.strictEqual(response.responseLines.at(0), 'Took a screenshot of the full current page.');
                assert.ok(response.responseLines.at(1)?.match(/Saved screenshot to.*\.png/));
            });
        });
        it('with element uid', async () => {
            await withMcpContext(async (response, context) => {
                const fixture = screenshots.button;
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setContent(fixture.html);
                context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(context.getSelectedMcpPage());
                await screenshotTool.handler({
                    params: {
                        format: 'png',
                        uid: '1_1',
                    },
                    page: context.getSelectedMcpPage(),
                }, response, context);
                assert.strictEqual(response.images.length, 1);
                assert.strictEqual(response.images[0].mimeType, 'image/png');
                assert.strictEqual(response.responseLines.at(0), 'Took a screenshot of node with uid "1_1".');
            });
        });
        it('disposes the element handle after an element screenshot', async () => {
            const { page, context, response, args } = createHandlerMocks();
            const { handle } = createMockElementHandle();
            page.getElementByUid.resolves(handle);
            handle.screenshot.resolves(new Uint8Array());
            await screenshot(args).handler({ params: { format: 'png', uid: '1_1' }, page }, response, context);
            sinon.assert.calledOnceWithExactly(page.getElementByUid, '1_1');
            sinon.assert.calledOnceWithExactly(handle.screenshot, {
                type: 'png',
                quality: undefined,
                optimizeForSpeed: true,
            });
            sinon.assert.notCalled(page.pptrPage.screenshot);
            sinon.assert.calledOnceWithExactly(handle.dispose);
        });
        it('disposes the element handle when the capture fails', async () => {
            const { page, context, response, args } = createHandlerMocks();
            const { handle } = createMockElementHandle();
            page.getElementByUid.resolves(handle);
            handle.screenshot.rejects(new Error('Capture failed'));
            await assert.rejects(screenshot(args).handler({ params: { format: 'png', uid: '1_1' }, page }, response, context), /Capture failed/);
            sinon.assert.notCalled(page.pptrPage.screenshot);
            sinon.assert.calledOnceWithExactly(handle.dispose);
            sinon.assert.notCalled(response.attachImage);
        });
        it('with filePath', async () => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const tmpDir = __addDisposableResource(env_1, createTempDir(), false);
                await withMcpContext(async (response, context) => {
                    const filePath = join(tmpDir.path, 'test-screenshot.png');
                    const fixture = screenshots.basic;
                    const page = context.getSelectedMcpPage().pptrPage;
                    await page.setContent(fixture.html);
                    await screenshotTool.handler({
                        params: { format: 'png', filePath },
                        page: context.getSelectedMcpPage(),
                    }, response, context);
                    assert.strictEqual(response.images.length, 0);
                    assert.strictEqual(response.responseLines.at(0), "Took a screenshot of the current page's viewport.");
                    const canonicalFilePath = await resolveCanonicalPath(filePath);
                    assert.strictEqual(response.responseLines.at(1), `Saved screenshot to ${canonicalFilePath}.`);
                    const stats = await stat(filePath);
                    assert.ok(stats.isFile());
                    assert.ok(stats.size > 0);
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
        it('with unwritable filePath', async () => {
            if (process.platform === 'win32') {
                const env_2 = { stack: [], error: void 0, hasError: false };
                try {
                    const tmpDir = __addDisposableResource(env_2, createTempDir(), false);
                    const filePath = join(tmpDir.path, 'readonly-file-for-screenshot-test.png');
                    // Create the file and make it read-only.
                    await writeFile(filePath, '');
                    await chmod(filePath, 0o400);
                    try {
                        await withMcpContext(async (response, context) => {
                            const fixture = screenshots.basic;
                            const page = context.getSelectedMcpPage().pptrPage;
                            await page.setContent(fixture.html);
                            await assert.rejects(screenshotTool.handler({
                                params: { format: 'png', filePath },
                                page: context.getSelectedMcpPage(),
                            }, response, context));
                        });
                    }
                    finally {
                        // Make the file writable again so it can be deleted.
                        await chmod(filePath, 0o600);
                    }
                }
                catch (e_2) {
                    env_2.error = e_2;
                    env_2.hasError = true;
                }
                finally {
                    __disposeResources(env_2);
                }
            }
            else {
                const env_3 = { stack: [], error: void 0, hasError: false };
                try {
                    const dir = __addDisposableResource(env_3, createTempDir('readonly-dir-for-screenshot-test-'), false);
                    await chmod(dir.path, 0o500);
                    const filePath = join(dir.path, 'test-screenshot.png');
                    try {
                        await withMcpContext(async (response, context) => {
                            const fixture = screenshots.basic;
                            const page = context.getSelectedMcpPage().pptrPage;
                            await page.setContent(fixture.html);
                            await assert.rejects(screenshotTool.handler({
                                params: { format: 'png', filePath },
                                page: context.getSelectedMcpPage(),
                            }, response, context));
                        });
                    }
                    finally {
                        await chmod(dir.path, 0o700);
                    }
                }
                catch (e_3) {
                    env_3.error = e_3;
                    env_3.hasError = true;
                }
                finally {
                    __disposeResources(env_3);
                }
            }
        });
        it('honors screenshotFormat default from CLI args', async () => {
            const tool = screenshot({
                screenshotFormat: 'jpeg',
            });
            await withMcpContext(async (response, context) => {
                const fixture = screenshots.basic;
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setContent(fixture.html);
                // No explicit format passed: zod should apply the CLI-driven default.
                await tool.handler({
                    params: { format: zod.object(tool.schema).parse({}).format },
                    page: context.getSelectedMcpPage(),
                }, response, context);
                assert.strictEqual(response.images.length, 1);
                assert.strictEqual(response.images[0].mimeType, 'image/jpeg');
            });
        });
        it('keeps "png" as default format when no CLI override is set', async () => {
            const tool = screenshot({});
            assert.strictEqual(zod.object(tool.schema).parse({}).format, 'png');
        });
        it('downscales viewport screenshot when screenshotMaxWidth is set', async () => {
            const tool = screenshot({
                screenshotMaxWidth: 100,
            });
            await withMcpContext(async (response, context) => {
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setViewport({ width: 800, height: 600 });
                await page.setContent(html `<div style="width:100vw;height:100vh;background:red"></div>`);
                await tool.handler({ params: { format: 'png' }, page: context.getSelectedMcpPage() }, response, context);
                assert.strictEqual(response.images.length, 1);
                const buf = Buffer.from(response.images[0].data, 'base64');
                assert.strictEqual(pngWidth(buf), 100);
                // Aspect ratio preserved: 800x600 -> 100x75.
                assert.strictEqual(pngHeight(buf), 75);
            });
        });
        it('honors screenshotMaxWidth at device scale factors above 1', async () => {
            const tool = screenshot({
                screenshotMaxWidth: 100,
            });
            await withMcpContext(async (response, context) => {
                const page = context.getSelectedMcpPage().pptrPage;
                assert.strictEqual(page.viewport(), null);
                await page.setContent(html `<div style="width:100vw;height:100vh;background:red"></div>`);
                const source = await page.evaluate(() => ({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    devicePixelRatio: window.devicePixelRatio,
                }));
                assert.strictEqual(source.devicePixelRatio, 2);
                await tool.handler({ params: { format: 'png' }, page: context.getSelectedMcpPage() }, response, context);
                assert.strictEqual(response.images.length, 1);
                const buf = Buffer.from(response.images[0].data, 'base64');
                assert.strictEqual(pngWidth(buf), 100);
                const expectedHeight = Math.round(source.height * (100 / source.width));
                assert.ok(Math.abs(pngHeight(buf) - expectedHeight) <= 1, `expected height ~${expectedHeight}, got ${pngHeight(buf)}`);
            }, { args: ['--force-device-scale-factor=2'] });
        });
        it('downscales viewport screenshot when no viewport is emulated', async () => {
            const tool = screenshot({
                screenshotMaxWidth: 100,
            });
            await withMcpContext(async (response, context) => {
                const page = context.getSelectedMcpPage().pptrPage;
                // No setViewport call here: the browser is launched and connected with
                // `defaultViewport: null`, so this is what a page looks like unless the
                // emulate tool has set a viewport.
                assert.strictEqual(page.viewport(), null);
                await page.setContent(html `<div style="width:100vw;height:100vh;background:red"></div>`);
                const source = await page.evaluate(() => ({
                    width: window.innerWidth,
                    height: window.innerHeight,
                }));
                await tool.handler({ params: { format: 'png' }, page: context.getSelectedMcpPage() }, response, context);
                assert.strictEqual(response.images.length, 1);
                const buf = Buffer.from(response.images[0].data, 'base64');
                assert.strictEqual(pngWidth(buf), 100);
                // The window size comes from the environment rather than an emulated
                // viewport, so allow a pixel of rounding slack on the derived height.
                const expectedHeight = Math.round(source.height * (100 / source.width));
                assert.ok(Math.abs(pngHeight(buf) - expectedHeight) <= 1, `expected height ~${expectedHeight}, got ${pngHeight(buf)}`);
            });
        });
        it('downscales using the smaller scale when both max-width and max-height are set', async () => {
            const tool = screenshot({
                screenshotMaxWidth: 400,
                screenshotMaxHeight: 60,
            });
            await withMcpContext(async (response, context) => {
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setViewport({ width: 800, height: 600 });
                await page.setContent(html `<div style="width:100vw;height:100vh"></div>`);
                await tool.handler({ params: { format: 'png' }, page: context.getSelectedMcpPage() }, response, context);
                const buf = Buffer.from(response.images[0].data, 'base64');
                // height bound dictates: 60/600 = 0.1 -> 80x60.
                assert.strictEqual(pngHeight(buf), 60);
                assert.strictEqual(pngWidth(buf), 80);
            });
        });
        it('does not resize when source is smaller than the max bounds', async () => {
            const tool = screenshot({
                screenshotMaxWidth: 4000,
                screenshotMaxHeight: 4000,
            });
            await withMcpContext(async (response, context) => {
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setViewport({ width: 800, height: 600 });
                await page.setContent(html `<div></div>`);
                await tool.handler({ params: { format: 'png' }, page: context.getSelectedMcpPage() }, response, context);
                const buf = Buffer.from(response.images[0].data, 'base64');
                assert.strictEqual(pngWidth(buf), 800);
                assert.strictEqual(pngHeight(buf), 600);
            });
        });
        it('downscales full page screenshot when screenshotMaxWidth is set', async () => {
            const tool = screenshot({
                screenshotMaxWidth: 200,
            });
            await withMcpContext(async (response, context) => {
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setViewport({ width: 800, height: 600 });
                await page.setContent(html `<style>
              body {
                margin: 0;
              }</style
            ><div style="width:1000px;height:1500px;background:red"></div>`);
                await tool.handler({
                    params: { format: 'png', fullPage: true },
                    page: context.getSelectedMcpPage(),
                }, response, context);
                const buf = Buffer.from(response.images[0].data, 'base64');
                // Source is at least 1000x1500; scale = 200/1000 = 0.2 -> ~200x300.
                // Allow ±2px to absorb sub-pixel rasterization rounding by Chrome.
                assert.strictEqual(pngWidth(buf), 200);
                assert.ok(Math.abs(pngHeight(buf) - 300) <= 2, `expected height near 300, got ${pngHeight(buf)}`);
            });
        });
        it('with malformed filePath', async () => {
            await withMcpContext(async (response, context) => {
                // Use a platform-specific invalid character.
                // On Windows, characters like '<', '>', ':', '"', '/', '\', '|', '?', '*' are invalid.
                // On POSIX, the null byte is invalid.
                const invalidChar = process.platform === 'win32' ? '>' : '\0';
                const filePath = `malformed${invalidChar}path.png`;
                const fixture = screenshots.basic;
                const page = context.getSelectedMcpPage().pptrPage;
                await page.setContent(fixture.html);
                await assert.rejects(screenshotTool.handler({
                    params: { format: 'png', filePath },
                    page: context.getSelectedMcpPage(),
                }, response, context));
            });
        });
    });
});
//# sourceMappingURL=screenshot.test.js.map