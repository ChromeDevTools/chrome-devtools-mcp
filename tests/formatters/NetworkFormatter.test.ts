/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, it} from 'node:test';

import {NetworkFormatter} from '../../src/formatters/NetworkFormatter.js';
import type {HTTPRequest} from '../../src/third_party/index.js';
import {getMockRequest, getMockResponse} from '../utils.js';

describe('NetworkFormatter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'network-formatter-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true});
  });

  describe('toString', () => {
    it('works', async () => {
      const request = getMockRequest();
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        saveFile: async () => ({filename: ''}),
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
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [success - 200]',
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
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [failed - 199]',
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
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [failed - 300]',
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
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [failed - Error in Network]',
      );
    });

    it('marks requests selected in DevTools UI', async () => {
      const request = getMockRequest();
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        selectedInDevToolsUI: true,
        saveFile: async () => ({filename: ''}),
      });

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [pending] [selected in the DevTools Network panel]',
      );
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

      const reqPath = join(tmpDir, 'test_req_' + Date.now());
      const resPath = join(tmpDir, 'test_res_' + Date.now());

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
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

      const reqPath = join(tmpDir, 'test_req_large_' + Date.now());
      const resPath = join(tmpDir, 'test_res_large_' + Date.now());

      await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
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
      });
      const result = formatter.toStringDetailed();

      assert.match(result, /"response":"body"/);
    });

    it('handles redirect chain', async () => {
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
      });
      const result = formatter.toStringDetailed();
      assert.match(result, /Redirect chain/);
      assert.match(result, /reqid=2/);
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

      const reqPath = join(tmpDir, 'req.txt');
      const resPath = join(tmpDir, 'res.txt');

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
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

      const reqPath = join(tmpDir, 'req_missing.txt');
      const resPath = join(tmpDir, 'res_missing.txt');

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
      });

      const result = formatter.toStringDetailed();
      assert.ok(
        result.includes(
          `### Response Body\n<Response body not available anymore>`,
        ),
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
      });
      const result = formatter.toJSON();
      assert.deepEqual(result, {
        requestId: 1,
        method: 'GET',
        url: 'http://example.com',
        status: '[pending]',
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
      });
      const result = formatter.toJSONDetailed();
      assert.deepEqual(result, {
        requestId: 1,
        method: 'GET',
        url: 'http://example.com',
        status: '[success - 200]',
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

      const reqPath = join(tmpDir, 'req_json.txt');
      const resPath = join(tmpDir, 'res_json.txt');

      const formatter = await NetworkFormatter.from(request, {
        fetchData: true,
        requestFilePath: reqPath,
        responseFilePath: resPath,
        saveFile: async (data, filename) => {
          await writeFile(filename, data);
          return {filename};
        },
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
});
