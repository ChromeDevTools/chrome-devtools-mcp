/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {NetworkFormatter} from '../../src/formatters/NetworkFormatter.js';
import type {HTTPRequest} from '../../src/third_party/index.js';
import {serverHooks} from '../server.js';
import {
  createTempDir,
  getMockRequest,
  getMockResponse,
  withBrowser,
} from '../utils.js';

describe('NetworkFormatter', () => {
  describe('toString', () => {
    it('works', async () => {
      const request = getMockRequest();
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [pending]',
      );
    });
    it('shows correct method', async () => {
      const request = getMockRequest({method: 'POST'});
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 POST http://example.com [pending]',
      );
    });
    it('shows correct status for request with response code in 200', async () => {
      const response = getMockResponse();
      const request = getMockRequest({response});
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [200]',
      );
    });
    it('shows correct status for request with response code in 100', async () => {
      const response = getMockResponse({
        status: 199,
      });
      const request = getMockRequest({response});
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [199]',
      );
    });
    it('shows correct status for request with response code above 200', async () => {
      const response = getMockResponse({
        status: 300,
      });
      const request = getMockRequest({response});
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [300]',
      );
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
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [Error in Network]',
      );
    });

    it('marks requests selected in DevTools UI', async () => {
      const request = getMockRequest();
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        selectedInDevToolsUI: true,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [pending] [selected in the DevTools Network panel]',
      );
    });

    it('truncates long urls', async () => {
      const longUrl = `http://example.com/${'a'.repeat(500)}`;
      const request = getMockRequest({url: longUrl});
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        `reqid=1 GET ${longUrl.substring(0, 255)}... <truncated> [pending]`,
      );
      // The structured data keeps the full URL.
      assert.equal(formatter.toJSON().url, longUrl);
    });

    it('truncates data: urls', async () => {
      const dataUrl = `data:image/png;base64,${'A'.repeat(5000)}`;
      const request = getMockRequest({url: dataUrl});
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(
        formatter.toString(),
        `reqid=1 GET ${dataUrl.substring(0, 255)}... <truncated> [pending]`,
      );
    });

    it('does not truncate urls within the size limit', async () => {
      // Exactly at the 150 character limit.
      const url = `http://example.com/${'a'.repeat(131)}`;
      const request = getMockRequest({url});
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      assert.equal(formatter.toString(), `reqid=1 GET ${url} [pending]`);
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
        saveFile: async () => ({filename: ''}),
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
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });
      const result = formatter.toStringDetailed();

      assert.match(
        result,
        new RegExp(
          JSON.stringify({
            request: 'body',
          }),
        ),
      );
    });

    it('truncates request body', async () => {
      const request = getMockRequest({
        postData: 'some text that is longer than expected',
        hasPostData: true,
      });
      const formatter = await NetworkFormatter.from(request, {
        requestId: 20,
        fetchData: true,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });
      const result = formatter.toStringDetailed();
      assert.match(result, /some text/);
    });

    it('should save bodies to file when file paths are provided', async () => {
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
      } as unknown as HTTPRequest;

      using tmpDir = createTempDir('network-formatter-test-');
      const reqPath = join(tmpDir.path, 'test_req_' + Date.now());
      const resPath = join(tmpDir.path, 'test_res_' + Date.now());

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
        redactNetworkHeaders: false,
      });

      const json = formatter.toJSONDetailed() as {
        requestBody: string;
        responseBody: string;
        requestBodyFilePath: string;
        responseBodyFilePath: string;
      };
      assert.strictEqual(json.requestBodyFilePath, reqPath);
      assert.strictEqual(json.responseBodyFilePath, resPath);
      assert.strictEqual(json.requestBody, undefined);
      assert.strictEqual(json.responseBody, undefined);
    });

    it('should not truncate large bodies when saving to file', async () => {
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
      } as unknown as HTTPRequest;

      using tmpDir = createTempDir('network-formatter-test-');
      const reqPath = join(tmpDir.path, 'test_req_large_' + Date.now());
      const resPath = join(tmpDir.path, 'test_res_large_' + Date.now());

      await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
        redactNetworkHeaders: false,
      });

      const reqContent = await readFile(reqPath, 'utf8');
      const resContent = await readFile(resPath, 'utf8');

      assert.strictEqual(reqContent, largeBody);
      assert.strictEqual(resContent, largeBody);
    });

    it('handles response body', async () => {
      const response = getMockResponse();
      response.buffer = () => {
        return Promise.resolve(Buffer.from(JSON.stringify({response: 'body'})));
      };
      const request = getMockRequest({response});

      const formatter = await NetworkFormatter.from(request, {
        requestId: 200,
        fetchData: true,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });
      const result = formatter.toStringDetailed();

      assert.match(result, /"response":"body"/);
    });

    it('handles redirect chain', async t => {
      const redirectRequest = getMockRequest({
        url: 'http://example.com/redirect',
      });
      const request = getMockRequest({
        redirectChain: [redirectRequest],
      });
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        requestIdResolver: () => 2,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });
      const result = formatter.toStringDetailed();
      t.assert.snapshot(result);
    });
    it('renders the redirect chain in the same order in text and JSON', async () => {
      // A >=2 element chain makes ordering observable (a single redirect hides
      // the bug). toStringDetailed() and toJSONDetailed() are emitted from the
      // same get_network_request call, so they must agree on the order.
      const first = getMockRequest({url: 'http://example.com/first'});
      const second = getMockRequest({url: 'http://example.com/second'});
      const request = getMockRequest({
        url: 'http://example.com/final',
        redirectChain: [first, second],
      });
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        requestIdResolver: () => 2,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      const text = formatter.toStringDetailed();
      const json = formatter.toJSONDetailed();

      const textOrder = [
        ...text.matchAll(/http:\/\/example\.com\/(first|second)/g),
      ].map(m => m[0]);
      const jsonOrder = (json.redirectChain ?? []).map(entry => entry.url);

      assert.deepStrictEqual(
        textOrder,
        jsonOrder,
        `redirect chain order differs between text and JSON`,
      );
    });
    it('shows saved to file message in toStringDetailed', async () => {
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
      } as unknown as HTTPRequest;

      using tmpDir = createTempDir('network-formatter-test-');
      const reqPath = join(tmpDir.path, 'req.txt');
      const resPath = join(tmpDir.path, 'res.txt');

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
        redactNetworkHeaders: false,
      });

      const result = formatter.toStringDetailed();
      assert.ok(result.includes(`Saved to ${reqPath}.`));
      assert.ok(result.includes(`Saved to ${resPath}.`));
    });

    it('handles missing bodies with filepath', async () => {
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
      } as unknown as HTTPRequest;

      using tmpDir = createTempDir('network-formatter-test-');
      const reqPath = join(tmpDir.path, 'req_missing.txt');
      const resPath = join(tmpDir.path, 'res_missing.txt');

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
        redactNetworkHeaders: false,
      });

      const result = formatter.toStringDetailed();
      assert.ok(
        result.includes(
          `### Response Body\n<Response body not available anymore>`,
        ),
      );
    });

    it('handles missing response body when inline', async () => {
      const response = getMockResponse();
      response.buffer = () => Promise.reject(new Error('Evicted'));
      const request = getMockRequest({response});

      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        fetchData: true,
        saveFile: async () => ({filename: ''}),
        redactNetworkHeaders: false,
      });

      const result = formatter.toStringDetailed();
      assert.ok(result.includes(`### Response Body\n<not available anymore>`));
      assert.strictEqual(
        formatter.toJSONDetailed().responseBody,
        '<not available anymore>',
      );
    });
  });

  describe('toJSON', () => {
    it('returns structured data', async () => {
      const request = getMockRequest();
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        selectedInDevToolsUI: true,
        saveFile: async () => ({filename: ''}),
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
        saveFile: async () => ({filename: ''}),
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
        saveFile: async () => ({filename: ''}),
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
      } as unknown as HTTPRequest;

      using tmpDir = createTempDir('network-formatter-test-');
      const reqPath = join(tmpDir.path, 'req_json.txt');
      const resPath = join(tmpDir.path, 'res_json.txt');

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
        redactNetworkHeaders: false,
      });

      const result = formatter.toJSONDetailed() as {
        requestBodyFilePath: string;
        responseBodyFilePath: string;
        requestBody?: string;
        responseBody?: string;
      };

      assert.strictEqual(result.requestBodyFilePath, reqPath);
      assert.strictEqual(result.responseBodyFilePath, resPath);
      assert.strictEqual(result.requestBody, undefined);
      assert.strictEqual(result.responseBody, undefined);
    });
  });

  describe('request body bytes', () => {
    const server = serverHooks();
    const BINARY_BODY = [0x00, 0xff, 0x80, 0x0a, 0xc8, 0x01];

    async function captureUpload(
      body: string,
      contentType: string,
    ): Promise<{
      received: Buffer;
      saved?: Buffer;
      savedTo?: string;
      inlineBody?: string;
    }> {
      let received = Buffer.alloc(0);
      let saved: Buffer | undefined;
      let savedTo: string | undefined;
      let inlineBody: string | undefined;
      server.addHtmlRoute('/index.html', '<title>upload</title>');
      server.addRoute('/upload', (req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
          received = Buffer.concat(chunks);
          res.writeHead(200, {'Content-Type': 'text/plain'});
          res.end('ok');
        });
      });
      let request: HTTPRequest | undefined;
      await withBrowser(async (_browser, page) => {
        page.on('request', r => {
          if (r.url().endsWith('/upload')) {
            request = r;
          }
        });
        await page.goto(server.getRoute('/index.html'));
        await page.evaluate(
          async (url, bodyExpression, type) => {
            const payload = new Function(`return ${bodyExpression}`)();
            await fetch(url, {
              method: 'POST',
              headers: {'content-type': type},
              body: payload,
            });
          },
          server.getRoute('/upload'),
          body,
          contentType,
        );
        assert.ok(request, 'the upload request was not observed');
        // Format while the page (and its CDP session) is still alive.
        const captured = await NetworkFormatter.from(request, {
          requestId: 1,
          fetchData: true,
          requestFilePath: '/upload',
          saveFile: async data => {
            saved = Buffer.from(data);
            return {filename: '/upload.network-request'};
          },
          redactNetworkHeaders: false,
        });
        const inline = await NetworkFormatter.from(request, {
          requestId: 1,
          fetchData: true,
          redactNetworkHeaders: false,
        });
        savedTo = captured.toJSONDetailed().requestBodyFilePath;
        inlineBody = inline.toJSONDetailed().requestBody;
      });
      return {received, saved, savedTo, inlineBody};
    }

    it('saves a binary request body byte for byte', async () => {
      const {received, saved, savedTo, inlineBody} = await captureUpload(
        `new Uint8Array(${JSON.stringify(BINARY_BODY)})`,
        'application/octet-stream',
      );
      assert.deepStrictEqual([...received], BINARY_BODY);
      assert.ok(saved);
      assert.deepStrictEqual([...saved], BINARY_BODY);
      assert.strictEqual(savedTo, '/upload.network-request');
      assert.strictEqual(inlineBody, '<binary data>');
    });

    it('still saves and shows a text request body unchanged', async () => {
      const text = '{"user":"u","name":"é中"}';
      const {received, saved, inlineBody} = await captureUpload(
        JSON.stringify(text),
        'application/json',
      );
      assert.strictEqual(received.toString('utf-8'), text);
      assert.ok(saved);
      assert.strictEqual(saved.toString('utf-8'), text);
      assert.strictEqual(inlineBody, text);
    });
  });

  describe('request body fallback', () => {
    it('falls back to postData() when no CDP session is attached', async () => {
      let saved: Buffer | undefined;
      const request = getMockRequest({
        method: 'POST',
        hasPostData: true,
        postData: '{"a":1}',
      });
      await NetworkFormatter.from(request, {
        requestId: 1,
        fetchData: true,
        requestFilePath: '/req',
        saveFile: async data => {
          saved = Buffer.from(data);
          return {filename: '/req.network-request'};
        },
        redactNetworkHeaders: false,
      });
      assert.strictEqual(saved?.toString('utf-8'), '{"a":1}');
    });

    it('decodes a base64 body returned by Network.getRequestPostData', async () => {
      let saved: Buffer | undefined;
      const sent: unknown[] = [];
      const request = Object.assign(
        getMockRequest({method: 'POST', hasPostData: true, postData: '\ufffd'}),
        {
          id: 'cdp-1',
          client: {
            send: async (method: string, params: unknown) => {
              sent.push([method, params]);
              return {postData: 'AP+ACsgB', base64Encoded: true};
            },
          },
        },
      );
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        fetchData: true,
        requestFilePath: '/req',
        saveFile: async data => {
          saved = Buffer.from(data);
          return {filename: '/req.network-request'};
        },
        redactNetworkHeaders: false,
      });
      assert.deepStrictEqual(sent, [
        ['Network.getRequestPostData', {requestId: 'cdp-1'}],
      ]);
      assert.deepStrictEqual([...(saved ?? [])], [0, 255, 128, 10, 200, 1]);
      assert.strictEqual(
        formatter.toJSONDetailed().requestBodyFilePath,
        '/req.network-request',
      );
    });

    it('falls back to postData() when CDP no longer has the body', async () => {
      const request = Object.assign(
        getMockRequest({method: 'POST', hasPostData: true, postData: 'a=b'}),
        {
          id: 'cdp-2',
          client: {
            send: async () => {
              throw new Error('No post data available for the request');
            },
          },
        },
      );
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        fetchData: true,
        redactNetworkHeaders: false,
      });
      assert.strictEqual(formatter.toJSONDetailed().requestBody, 'a=b');
    });
  });
});
