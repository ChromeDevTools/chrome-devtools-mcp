/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {HTTPRequest, ResourceType} from '../third_party/index.js';

/**
 * The resource type a request is filtered by. Chrome reports CORS preflights
 * and `<link rel=prefetch>` requests as `Other`, so `resourceTypes: ['preflight']`
 * and `['prefetch']` could never match. Those two are recognised from the
 * headers Chrome sends with them; every other type is Chrome's own.
 */
export function getFilterableResourceType(request: HTTPRequest): ResourceType {
  const type = request.resourceType();
  if (type !== 'other') {
    return type;
  }
  const headers = request.headers();
  if (
    request.method() === 'OPTIONS' &&
    headers['access-control-request-method'] !== undefined
  ) {
    return 'preflight';
  }
  if (/^prefetch\b/i.test(headers['sec-purpose'] ?? '')) {
    return 'prefetch';
  }
  return type;
}
