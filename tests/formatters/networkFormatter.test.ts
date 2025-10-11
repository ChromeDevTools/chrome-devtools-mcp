/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ProtocolError} from 'puppeteer-core';

import {
  getFormattedHeaderValue,
  getFormattedRequestBody,
  getFormattedResponseBody,
  getShortDescriptionForRequest,
} from '../../src/formatters/networkFormatter.js';
import {getMockRequest, getMockResponse} from '../utils.js';

describe('networkFormatter', () => {
  describe('getShortDescriptionForRequest', () => {
    it('works', async () => {
      const request = getMockRequest();
      const result = getShortDescriptionForRequest(request);

      assert.equal(result, 'http://example.com GET [pending]');
    });
    it('shows correct method', async () => {
      const request = getMockRequest({method: 'POST'});
      const result = getShortDescriptionForRequest(request);

      assert.equal(result, 'http://example.com POST [pending]');
    });
    it('shows correct status for request with response code in 200', async () => {
      const response = getMockResponse();
      const request = getMockRequest({response});
      const result = getShortDescriptionForRequest(request);

      assert.equal(result, 'http://example.com GET [success - 200]');
    });
    it('shows correct status for request with response code in 100', async () => {
      const response = getMockResponse({
        status: 199,
      });
      const request = getMockRequest({response});
      const result = getShortDescriptionForRequest(request);

      assert.equal(result, 'http://example.com GET [failed - 199]');
    });
    it('shows correct status for request with response code above 200', async () => {
      const response = getMockResponse({
        status: 300,
      });
      const request = getMockRequest({response});
      const result = getShortDescriptionForRequest(request);

      assert.equal(result, 'http://example.com GET [failed - 300]');
    });
    it('shows correct status for request that failed', async () => {
      const request = getMockRequest({
        failure() {
          return {
            errorText: 'Error in Network',
          };
        },
      });
      const result = getShortDescriptionForRequest(request);

      assert.equal(
        result,
        'http://example.com GET [failed - Error in Network]',
      );
    });
  });

  describe('getFormattedHeaderValue', () => {
    it('works', () => {
      const result = getFormattedHeaderValue({
        key: 'value',
      });

      assert.deepEqual(result, ['- key:value']);
    });
    it('with multiple', () => {
      const result = getFormattedHeaderValue({
        key: 'value',
        key2: 'value2',
        key3: 'value3',
        key4: 'value4',
      });

      assert.deepEqual(result, [
        '- key:value',
        '- key2:value2',
        '- key3:value3',
        '- key4:value4',
      ]);
    });
    it('with non', () => {
      const result = getFormattedHeaderValue({});

      assert.deepEqual(result, []);
    });
  });

  describe('getFormattedRequestBody', () => {
    it('shows data from fetchPostData if postData is undefined', async () => {
      const request = getMockRequest({
        hasPostData: true,
        postData: undefined,
        fetchPostData: Promise.resolve('test'),
      });

      const result = await getFormattedRequestBody(request, 200);

      assert.strictEqual(result, 'test');
    });
    it('shows empty string when no postData available', async () => {
      const request = getMockRequest({
        hasPostData: false,
      });

      const result = await getFormattedRequestBody(request, 200);

      assert.strictEqual(result, undefined);
    });
    it('shows request body when postData is available', async () => {
      const request = getMockRequest({
        postData: JSON.stringify({
          request: 'body',
        }),
        hasPostData: true,
      });

      const result = await getFormattedRequestBody(request, 200);

      assert.strictEqual(
        result,
        `${JSON.stringify({
          request: 'body',
        })}`,
      );
    });
    it('shows trunkated string correctly with postData', async () => {
      const request = getMockRequest({
        postData: 'some text that is longer than expected',
        hasPostData: true,
      });

      const result = await getFormattedRequestBody(request, 20);

      assert.strictEqual(result, 'some text that is lo... <truncated>');
    });
    it('shows trunkated string correctly with fetchPostData', async () => {
      const request = getMockRequest({
        fetchPostData: Promise.resolve(
          'some text that is longer than expected',
        ),
        postData: undefined,
        hasPostData: true,
      });

      const result = await getFormattedRequestBody(request, 20);

      assert.strictEqual(result, 'some text that is lo... <truncated>');
    });
    it('shows nothing on exception', async () => {
      const request = getMockRequest({
        hasPostData: true,
        postData: undefined,
        fetchPostData: Promise.reject(new ProtocolError()),
      });

      const result = await getFormattedRequestBody(request, 200);

      assert.strictEqual(result, undefined);
    });
  });

  describe('getFormattedResponseBody', () => {
    it('handles empty buffer correctly', async () => {
      const response = getMockResponse();
      response.buffer = () => {
        return Promise.resolve(Buffer.from(''));
      };

      const result = await getFormattedResponseBody(response, 200);

      assert.strictEqual(result, '<empty response>');
    });
    it('handles base64 text correctly', async () => {
      const binaryBuffer = Buffer.from([
        0xde, 0xad, 0xbe, 0xef, 0x00, 0x41, 0x42, 0x43,
      ]);
      const response = getMockResponse();
      response.buffer = () => {
        return Promise.resolve(binaryBuffer);
      };

      const result = await getFormattedResponseBody(response, 200);

      assert.strictEqual(result, '<binary data>');
    });
    it('handles the text limit correctly', async () => {
      const response = getMockResponse();
      response.buffer = () => {
        return Promise.resolve(
          Buffer.from('some text that is longer than expected'),
        );
      };

      const result = await getFormattedResponseBody(response, 20);

      assert.strictEqual(result, 'some text that is lo... <truncated>');
    });
    it('handles the text format correctly', async () => {
      const response = getMockResponse();
      response.buffer = () => {
        return Promise.resolve(Buffer.from(JSON.stringify({response: 'body'})));
      };

      const result = await getFormattedResponseBody(response, 200);

      assert.strictEqual(result, `${JSON.stringify({response: 'body'})}`);
    });
    it('handles error correctly', async () => {
      const response = getMockResponse();
      response.buffer = () => {
        // CDP Error simulation
        return Promise.reject(new ProtocolError());
      };

      const result = await getFormattedResponseBody(response, 200);

      assert.strictEqual(result, undefined);
    });
  });
});
