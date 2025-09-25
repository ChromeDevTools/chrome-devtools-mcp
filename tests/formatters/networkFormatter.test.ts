/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  getFormattedHeaderValue,
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
});
