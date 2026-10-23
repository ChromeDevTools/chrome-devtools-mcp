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
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sinon from 'sinon';
import { NetworkFormatter } from '../../src/formatters/NetworkFormatter.js';
import { createTempDir, getMockRequest, getMockResponse } from '../utils.js';
describe('NetworkFormatter', () => {
    describe('toString', () => {
        it('works', async () => {
            const request = getMockRequest();
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), 'reqid=1 GET http://example.com [pending]');
        });
        it('shows correct method', async () => {
            const request = getMockRequest({ method: 'POST' });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), 'reqid=1 POST http://example.com [pending]');
        });
        it('shows correct status for request with response code in 200', async () => {
            const response = getMockResponse();
            const request = getMockRequest({ response });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), 'reqid=1 GET http://example.com [200]');
        });
        it('shows correct status for request with response code in 100', async () => {
            const response = getMockResponse({
                status: 199,
            });
            const request = getMockRequest({ response });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), 'reqid=1 GET http://example.com [199]');
        });
        it('shows correct status for request with response code above 200', async () => {
            const response = getMockResponse({
                status: 300,
            });
            const request = getMockRequest({ response });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), 'reqid=1 GET http://example.com [300]');
        });
        it('shows correct status for request that failed', async () => {
            const request = getMockRequest({
                failure() {
                    return {
                        errorText: 'Error in Network',
                    };
                },
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), 'reqid=1 GET http://example.com [Error in Network]');
        });
        it('marks requests selected in DevTools UI', async () => {
            const request = getMockRequest();
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                selectedInDevToolsUI: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), 'reqid=1 GET http://example.com [pending] [selected in the DevTools Network panel]');
        });
        it('truncates long urls', async () => {
            const longUrl = `http://example.com/${'a'.repeat(500)}`;
            const request = getMockRequest({ url: longUrl });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), `reqid=1 GET ${longUrl.substring(0, 255)}... <truncated> [pending]`);
            // The structured data keeps the full URL.
            assert.strictEqual(formatter.toJSON().url, longUrl);
        });
        it('does not split a surrogate pair when truncating a url', async () => {
            // 254 characters, then an emoji straddling the 255 code unit mark.
            const prefix = `http://example.com/${'a'.repeat(235)}`;
            const url = `${prefix}\u{1F600}${'b'.repeat(20)}`;
            const request = getMockRequest({ url });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), `reqid=1 GET ${prefix}... <truncated> [pending]`);
        });
        it('truncates data: urls', async () => {
            const dataUrl = `data:image/png;base64,${'A'.repeat(5000)}`;
            const request = getMockRequest({ url: dataUrl });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), `reqid=1 GET ${dataUrl.substring(0, 255)}... <truncated> [pending]`);
        });
        it('does not truncate urls within the size limit', async () => {
            // Exactly at the 150 character limit.
            const url = `http://example.com/${'a'.repeat(131)}`;
            const request = getMockRequest({ url });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toString(), `reqid=1 GET ${url} [pending]`);
        });
    });
    describe('toStringDetailed', () => {
        it('works with request body from fetchPostData', async () => {
            const request = getMockRequest({
                hasPostData: true,
                postData: undefined,
                fetchPostData: Promise.resolve('test'),
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 200,
                fetchData: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toStringDetailed();
            assert.match(result, /test/);
        });
        it('works with request body from postData', async () => {
            const request = getMockRequest({
                postData: JSON.stringify({
                    request: 'body',
                }),
                hasPostData: true,
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 200,
                fetchData: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toStringDetailed();
            assert.match(result, new RegExp(JSON.stringify({
                request: 'body',
            })));
        });
        it('truncates request body', async () => {
            const request = getMockRequest({
                postData: 'some text that is longer than expected',
                hasPostData: true,
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 20,
                fetchData: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toStringDetailed();
            assert.match(result, /some text/);
        });
        it('should save bodies to file when file paths are provided', async () => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const request = {
                    method: () => 'POST',
                    url: () => 'http://example.com',
                    headers: () => ({}),
                    hasPostData: () => true,
                    postData: () => 'request body',
                    response: () => ({
                        status: () => 200,
                        headers: () => ({}),
                        buffer: async () => Buffer.from('response body'),
                    }),
                    failure: () => null,
                    redirectChain: () => [],
                    fetchPostData: async () => undefined,
                };
                const tmpDir = __addDisposableResource(env_1, createTempDir('network-formatter-test-'), false);
                const reqPath = join(tmpDir.path, 'test_req_' + Date.now());
                const resPath = join(tmpDir.path, 'test_res_' + Date.now());
                const formatter = await NetworkFormatter.from(request, {
                    fetchData: true,
                    requestFilePath: reqPath,
                    responseFilePath: resPath,
                    saveFile: async (data, filename) => {
                        await writeFile(filename, data);
                        return { filename };
                    },
                    redactNetworkHeaders: false,
                });
                const json = formatter.toJSONDetailed();
                assert.strictEqual(json.requestBodyFilePath, reqPath);
                assert.strictEqual(json.responseBodyFilePath, resPath);
                assert.strictEqual(json.requestBody, undefined);
                assert.strictEqual(json.responseBody, undefined);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        });
        it('should not truncate large bodies when saving to file', async () => {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const largeBody = 'a'.repeat(10005);
                const request = {
                    method: () => 'POST',
                    url: () => 'http://example.com',
                    headers: () => ({}),
                    hasPostData: () => true,
                    postData: () => largeBody,
                    response: () => ({
                        status: () => 200,
                        headers: () => ({}),
                        buffer: async () => Buffer.from(largeBody),
                    }),
                    failure: () => null,
                    redirectChain: () => [],
                    fetchPostData: async () => undefined,
                };
                const tmpDir = __addDisposableResource(env_2, createTempDir('network-formatter-test-'), false);
                const reqPath = join(tmpDir.path, 'test_req_large_' + Date.now());
                const resPath = join(tmpDir.path, 'test_res_large_' + Date.now());
                await NetworkFormatter.from(request, {
                    fetchData: true,
                    requestFilePath: reqPath,
                    responseFilePath: resPath,
                    saveFile: async (data, filename) => {
                        await writeFile(filename, data);
                        return { filename };
                    },
                    redactNetworkHeaders: false,
                });
                const reqContent = await readFile(reqPath, 'utf8');
                const resContent = await readFile(resPath, 'utf8');
                assert.strictEqual(reqContent, largeBody);
                assert.strictEqual(resContent, largeBody);
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        });
        it('handles response body', async () => {
            const response = getMockResponse();
            response.buffer = () => {
                return Promise.resolve(Buffer.from(JSON.stringify({ response: 'body' })));
            };
            const request = getMockRequest({ response });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 200,
                fetchData: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toStringDetailed();
            assert.match(result, /"response":"body"/);
        });
        it('handles redirect chain', async (t) => {
            const redirectRequest = getMockRequest({
                url: 'http://example.com/redirect',
            });
            const request = getMockRequest({
                redirectChain: [redirectRequest],
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                requestIdResolver: () => 2,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toStringDetailed();
            t.assert.snapshot(result);
        });
        it('renders the redirect chain in the same order in text and JSON', async () => {
            // A >=2 element chain makes ordering observable (a single redirect hides
            // the bug). toStringDetailed() and toJSONDetailed() are emitted from the
            // same get_network_request call, so they must agree on the order.
            const first = getMockRequest({ url: 'http://example.com/first' });
            const second = getMockRequest({ url: 'http://example.com/second' });
            const request = getMockRequest({
                url: 'http://example.com/final',
                redirectChain: [first, second],
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                requestIdResolver: () => 2,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const text = formatter.toStringDetailed();
            const json = formatter.toJSONDetailed();
            const textOrder = [
                ...text.matchAll(/http:\/\/example\.com\/(first|second)/g),
            ].map(m => m[0]);
            const jsonOrder = (json.redirectChain ?? []).map(entry => entry.url);
            assert.deepStrictEqual(textOrder, jsonOrder, `redirect chain order differs between text and JSON`);
        });
        it('lists only earlier hops in the redirect chain of each hop', async () => {
            // Puppeteer gives every hop of a redirect the same chain array.
            const chain = [];
            const first = getMockRequest({
                url: 'http://example.com/first',
                redirectChain: chain,
            });
            const second = getMockRequest({
                url: 'http://example.com/second',
                redirectChain: chain,
            });
            const final = getMockRequest({
                url: 'http://example.com/final',
                redirectChain: chain,
            });
            chain.push(first, second);
            const chainOf = async (request) => {
                const formatter = await NetworkFormatter.from(request, {
                    requestId: 1,
                    saveFile: async () => ({ filename: '' }),
                    redactNetworkHeaders: false,
                });
                return (formatter.toJSONDetailed().redirectChain ?? []).map(entry => entry.url);
            };
            assert.deepStrictEqual(await chainOf(first), []);
            assert.deepStrictEqual(await chainOf(second), [
                'http://example.com/first',
            ]);
            assert.deepStrictEqual(await chainOf(final), [
                'http://example.com/second',
                'http://example.com/first',
            ]);
        });
        it('shows saved to file message in toStringDetailed', async () => {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const request = {
                    method: () => 'POST',
                    url: () => 'http://example.com',
                    headers: () => ({}),
                    hasPostData: () => true,
                    postData: () => 'request body',
                    response: () => ({
                        status: () => 200,
                        headers: () => ({}),
                        buffer: async () => Buffer.from('response body'),
                    }),
                    failure: () => null,
                    redirectChain: () => [],
                    fetchPostData: async () => undefined,
                };
                const tmpDir = __addDisposableResource(env_3, createTempDir('network-formatter-test-'), false);
                const reqPath = join(tmpDir.path, 'req.txt');
                const resPath = join(tmpDir.path, 'res.txt');
                const formatter = await NetworkFormatter.from(request, {
                    fetchData: true,
                    requestFilePath: reqPath,
                    responseFilePath: resPath,
                    saveFile: async (data, filename) => {
                        await writeFile(filename, data);
                        return { filename };
                    },
                    redactNetworkHeaders: false,
                });
                const result = formatter.toStringDetailed();
                assert.ok(result.includes(`Saved to ${reqPath}.`));
                assert.ok(result.includes(`Saved to ${resPath}.`));
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                __disposeResources(env_3);
            }
        });
        it('stops waiting for a response body that never finishes loading', async () => {
            const request = {
                method: () => 'GET',
                url: () => 'http://example.com',
                headers: () => ({}),
                hasPostData: () => false,
                response: () => ({
                    status: () => 500,
                    headers: () => ({}),
                    buffer: () => new Promise(() => { }),
                }),
                failure: () => null,
                redirectChain: () => [],
            };
            const formatter = await NetworkFormatter.from(request, {
                fetchData: true,
                responseBodyTimeout: 10,
                redactNetworkHeaders: false,
            });
            assert.strictEqual(formatter.toJSONDetailed().responseBody, '<Response body not available: the response did not finish loading within 10 ms>');
        });
        it('does not save a response body that never finishes loading', async () => {
            const request = {
                method: () => 'GET',
                url: () => 'http://example.com',
                headers: () => ({}),
                hasPostData: () => false,
                response: () => ({
                    status: () => 500,
                    headers: () => ({}),
                    buffer: () => new Promise(() => { }),
                }),
                failure: () => null,
                redirectChain: () => [],
            };
            const resPath = '/tmp/never-written';
            const saveFile = sinon.stub().resolves({ filename: resPath });
            const formatter = await NetworkFormatter.from(request, {
                fetchData: true,
                responseFilePath: resPath,
                responseBodyTimeout: 10,
                saveFile,
                redactNetworkHeaders: false,
            });
            const json = formatter.toJSONDetailed();
            sinon.assert.notCalled(saveFile);
            assert.strictEqual(json.responseBodyFilePath, undefined);
            assert.strictEqual(json.responseBody, '<Response body not available: the response did not finish loading within 10 ms>');
        });
        it('handles missing bodies with filepath', async () => {
            const env_4 = { stack: [], error: void 0, hasError: false };
            try {
                const request = {
                    method: () => 'POST',
                    url: () => 'http://example.com',
                    headers: () => ({}),
                    hasPostData: () => true, // Claim we have data
                    postData: () => null, // But returns null
                    response: () => ({
                        status: () => 200,
                        headers: () => ({}),
                        buffer: async () => {
                            throw new Error('Body not available');
                        },
                    }),
                    failure: () => null,
                    redirectChain: () => [],
                    fetchPostData: async () => {
                        throw new Error('Body not available');
                    },
                };
                const tmpDir = __addDisposableResource(env_4, createTempDir('network-formatter-test-'), false);
                const reqPath = join(tmpDir.path, 'req_missing.txt');
                const resPath = join(tmpDir.path, 'res_missing.txt');
                const formatter = await NetworkFormatter.from(request, {
                    fetchData: true,
                    requestFilePath: reqPath,
                    responseFilePath: resPath,
                    saveFile: async (data, filename) => {
                        await writeFile(filename, data);
                        return { filename };
                    },
                    redactNetworkHeaders: false,
                });
                const result = formatter.toStringDetailed();
                assert.ok(result.includes(`### Response Body\n<Response body not available anymore>`));
            }
            catch (e_4) {
                env_4.error = e_4;
                env_4.hasError = true;
            }
            finally {
                __disposeResources(env_4);
            }
        });
        it('throws error when responseFilePath saveFile fails rather than reporting body unavailable', async () => {
            const request = {
                method: () => 'GET',
                url: () => 'http://example.com/data',
                headers: () => ({}),
                hasPostData: () => false,
                postData: () => undefined,
                response: () => ({
                    status: () => 200,
                    headers: () => ({}),
                    buffer: async () => Buffer.from('response body data'),
                }),
                failure: () => null,
                redirectChain: () => [],
                fetchPostData: async () => undefined,
            };
            await assert.rejects(async () => {
                await NetworkFormatter.from(request, {
                    fetchData: true,
                    responseFilePath: '/unwritable/dir/blocked',
                    saveFile: async () => {
                        throw new Error('EACCES: permission denied, open /unwritable/dir/blocked.network-response');
                    },
                    redactNetworkHeaders: false,
                });
            }, /EACCES: permission denied/);
        });
        it('handles missing response body when inline', async () => {
            const response = getMockResponse();
            response.buffer = () => Promise.reject(new Error('Evicted'));
            const request = getMockRequest({ response });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                fetchData: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toStringDetailed();
            assert.ok(result.includes(`### Response Body\n<not available anymore>`));
            assert.strictEqual(formatter.toJSONDetailed().responseBody, '<not available anymore>');
        });
    });
    describe('toJSON', () => {
        it('returns structured data', async () => {
            const request = getMockRequest();
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                selectedInDevToolsUI: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toJSON();
            assert.deepEqual(result, {
                requestId: 1,
                method: 'GET',
                url: 'http://example.com',
                status: 'pending',
                selectedInDevToolsUI: true,
            });
        });
    });
    describe('toJSONDetailed', () => {
        it('returns structured detailed data', async () => {
            const response = getMockResponse();
            response.buffer = () => Promise.resolve(Buffer.from('response'));
            const request = getMockRequest({
                response,
                postData: 'request',
                hasPostData: true,
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                fetchData: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: false,
            });
            const result = formatter.toJSONDetailed();
            assert.deepEqual(result, {
                requestId: 1,
                method: 'GET',
                url: 'http://example.com',
                status: '200',
                selectedInDevToolsUI: undefined,
                requestHeaders: {
                    'content-size': '10',
                },
                requestBody: 'request',
                requestBodyFilePath: undefined,
                responseHeaders: {},
                responseBody: 'response',
                responseBodyFilePath: undefined,
                failure: undefined,
                redirectChain: undefined,
            });
        });
        it('redacts headers', async () => {
            const response = getMockResponse({
                headers: {
                    'set-cookie': 'secret=123',
                    'content-type': 'text/plain',
                },
            });
            response.buffer = () => Promise.resolve(Buffer.from('response'));
            const request = getMockRequest({
                response,
                headers: {
                    cookie: 'secret=123',
                    'user-agent': 'test',
                },
            });
            const formatter = await NetworkFormatter.from(request, {
                requestId: 1,
                fetchData: true,
                saveFile: async () => ({ filename: '' }),
                redactNetworkHeaders: true,
            });
            const result = formatter.toJSONDetailed();
            assert.deepEqual(result.requestHeaders, {
                cookie: '<redacted>',
                'user-agent': 'test',
            });
            assert.deepEqual(result.responseHeaders, {
                'set-cookie': '<redacted>',
                'content-type': 'text/plain',
            });
        });
        it('returns file paths in structured detailed data', async () => {
            const env_5 = { stack: [], error: void 0, hasError: false };
            try {
                const request = {
                    method: () => 'POST',
                    url: () => 'http://example.com',
                    headers: () => ({}),
                    hasPostData: () => true,
                    postData: () => 'request body',
                    response: () => ({
                        status: () => 200,
                        headers: () => ({}),
                        buffer: async () => Buffer.from('response body'),
                    }),
                    failure: () => null,
                    redirectChain: () => [],
                    fetchPostData: async () => undefined,
                };
                const tmpDir = __addDisposableResource(env_5, createTempDir('network-formatter-test-'), false);
                const reqPath = join(tmpDir.path, 'req_json.txt');
                const resPath = join(tmpDir.path, 'res_json.txt');
                const formatter = await NetworkFormatter.from(request, {
                    fetchData: true,
                    requestFilePath: reqPath,
                    responseFilePath: resPath,
                    saveFile: async (data, filename) => {
                        await writeFile(filename, data);
                        return { filename };
                    },
                    redactNetworkHeaders: false,
                });
                const result = formatter.toJSONDetailed();
                assert.strictEqual(result.requestBodyFilePath, reqPath);
                assert.strictEqual(result.responseBodyFilePath, resPath);
                assert.strictEqual(result.requestBody, undefined);
                assert.strictEqual(result.responseBody, undefined);
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
});
//# sourceMappingURL=NetworkFormatter.test.js.map