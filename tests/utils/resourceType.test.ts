/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {getFilterableResourceType} from '../../src/utils/resourceType.js';
import {getMockRequest} from '../utils.js';

describe('getFilterableResourceType', () => {
  it('keeps the type Chrome reported', () => {
    assert.strictEqual(
      getFilterableResourceType(getMockRequest({resourceType: 'fetch'})),
      'fetch',
    );
  });

  it('recognises a CORS preflight reported as other', () => {
    const request = getMockRequest({
      method: 'OPTIONS',
      resourceType: 'other',
      headers: {'access-control-request-method': 'PUT'},
    });
    assert.strictEqual(getFilterableResourceType(request), 'preflight');
  });

  it('keeps a plain OPTIONS request as other', () => {
    const request = getMockRequest({
      method: 'OPTIONS',
      resourceType: 'other',
      headers: {},
    });
    assert.strictEqual(getFilterableResourceType(request), 'other');
  });

  it('recognises a prefetch reported as other', () => {
    const request = getMockRequest({
      resourceType: 'other',
      headers: {'sec-purpose': 'prefetch'},
    });
    assert.strictEqual(getFilterableResourceType(request), 'prefetch');
  });

  it('keeps an unrelated other request as other', () => {
    const request = getMockRequest({resourceType: 'other', headers: {}});
    assert.strictEqual(getFilterableResourceType(request), 'other');
  });
});
