/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {McpWorker, workerIdPrefix} from '../src/McpWorker.js';

import {createMockTarget, createMockWebWorker} from './mocks.js';

describe('McpWorker', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('labels ids by worker type', () => {
    assert.equal(workerIdPrefix('service_worker'), 'sw');
    assert.equal(workerIdPrefix('dedicated_worker'), 'dw');
    assert.equal(workerIdPrefix('shared_worker'), 'shw');
  });

  it('exposes the id and type it was created with', () => {
    const worker = new McpWorker('sw-3', 'service_worker', createMockTarget());
    assert.equal(worker.id, 'sw-3');
    assert.equal(worker.type, 'service_worker');
  });

  it('reads url from the target rather than a cached copy', () => {
    const target = createMockTarget();
    target.url
      .onFirstCall()
      .returns('chrome-extension://abc/first.js')
      .onSecondCall()
      .returns('chrome-extension://abc/second.js');
    const worker = new McpWorker('sw-1', 'service_worker', target);
    assert.equal(worker.url, 'chrome-extension://abc/first.js');
    assert.equal(worker.url, 'chrome-extension://abc/second.js');
  });

  it('coerces a missing worker execution context to undefined', async () => {
    const target = createMockTarget();
    target.worker.resolves(null);
    const worker = new McpWorker('sw-1', 'service_worker', target);
    assert.equal(await worker.worker(), undefined);
  });

  it('returns the underlying WebWorker when the target has one', async () => {
    const webWorker = createMockWebWorker();
    const target = createMockTarget();
    target.worker.resolves(webWorker);
    const worker = new McpWorker('sw-1', 'service_worker', target);
    assert.equal(await worker.worker(), webWorker);
  });
});
