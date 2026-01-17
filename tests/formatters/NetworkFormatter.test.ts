/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {NetworkFormatter} from '../../src/formatters/NetworkFormatter.js';
import {getMockRequest, getMockResponse} from '../utils.js';

describe('NetworkFormatter', () => {
  describe('toString', () => {
    it('works', async () => {
      const request = getMockRequest();
      const formatter = await NetworkFormatter.from(request, {requestId: 1});

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [pending]',
      );
    });
    it('shows correct method', async () => {
      const request = getMockRequest({method: 'POST'});
      const formatter = await NetworkFormatter.from(request, {requestId: 1});

      assert.equal(
        formatter.toString(),
        'reqid=1 POST http://example.com [pending]',
      );
    });
    it('shows correct status for request with response code in 200', async () => {
      const response = getMockResponse();
      const request = getMockRequest({response});
      const formatter = await NetworkFormatter.from(request, {requestId: 1});

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
      const formatter = await NetworkFormatter.from(request, {requestId: 1});

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [info - 199]',
      );
    });
    it('shows correct status for request with response code above 200', async () => {
      const response = getMockResponse({
        status: 300,
      });
      const request = getMockRequest({response});
      const formatter = await NetworkFormatter.from(request, {requestId: 1});

      assert.equal(
        formatter.toString(),
        'reqid=1 GET http://example.com [redirect - 300]',
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
      const formatter = await NetworkFormatter.from(request, {requestId: 1});

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
      });
      const result = formatter.toStringDetailed();
      assert.match(result, /some text/);
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
      });
      const result = formatter.toStringDetailed();
      assert.match(result, /Redirect chain/);
      assert.match(result, /reqid=2/);
    });
  });

  describe('toJSON', () => {
    it('returns structured data', async () => {
      const request = getMockRequest();
      const formatter = await NetworkFormatter.from(request, {
        requestId: 1,
        selectedInDevToolsUI: true,
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
        responseHeaders: {},
        responseBody: 'response',
        failure: undefined,
        redirectChain: undefined,
      });
    });
  });
});
