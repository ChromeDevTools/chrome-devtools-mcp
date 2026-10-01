/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {UncaughtError} from '../../src/collectors/PageCollector.js';
import {ServiceWorkerConsoleCollector} from '../../src/collectors/ServiceWorkerCollector.js';
import {McpWorker} from '../../src/McpWorker.js';
import {TargetType, type Protocol} from '../../src/third_party/index.js';
import {stableIdSymbol} from '../../src/utils/id.js';
import {
  createMockPuppeteerBrowser,
  createMockPuppeteerTarget,
} from '../mocks.js';

describe('ServiceWorkerConsoleCollector', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('limits logs to 1000 per extension', () => {
    const collector = new ServiceWorkerConsoleCollector(undefined, 10);
    const extensionId = 'test-extension';

    const mockDetails: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 1,
      text: 'Error',
      lineNumber: 1,
      columnNumber: 1,
    };

    for (let i = 0; i < 15; i++) {
      const error = new UncaughtError(
        {...mockDetails, exceptionId: i},
        extensionId,
      );
      collector.addLog(extensionId, error);
    }

    const logs = collector.getData(extensionId);
    assert.strictEqual(logs.length, 10, 'Should limit logs to 10');

    const firstLog = logs[0] as UncaughtError;
    assert.strictEqual(
      firstLog.details.exceptionId,
      5,
      'Oldest log should be Log 5',
    );

    const lastLog = logs[logs.length - 1] as UncaughtError;
    assert.strictEqual(
      lastLog.details.exceptionId,
      14,
      'Last log should be Log 14',
    );

    const data = collector.getData(extensionId);
    assert.strictEqual(data.length, 10, 'getData should return limited logs');

    const logToFind = data[0];
    const logId = logToFind[stableIdSymbol];
    assert.ok(logId, 'Log should have a stable ID');

    const foundLog = collector.getById(extensionId, logId);
    assert.strictEqual(
      foundLog,
      logToFind,
      'getById should return correct log',
    );

    const foundViaFind = collector.find(extensionId, item => {
      return item[stableIdSymbol] === logId;
    });
    assert.strictEqual(
      foundViaFind,
      logToFind,
      'find should return correct log',
    );
  });

  it('ignores "No target with given id found" when service worker target disappears during subscribe', async () => {
    const browser = createMockPuppeteerBrowser();
    const target = createMockPuppeteerTarget({
      url: 'chrome-extension://ext-id/sw.js',
    });
    target.type.returns(TargetType.SERVICE_WORKER);
    target.createCDPSession.rejects(
      new Error(
        'Protocol error (Target.attachToTarget): No target with given id found',
      ),
    );

    const collector = new ServiceWorkerConsoleCollector(browser);
    await collector.init([new McpWorker('sw-1', 'service_worker', target)]);
    await new Promise(resolve => setTimeout(resolve, 0));
    sinon.assert.calledOnce(target.createCDPSession);
    collector.dispose();
  });
});
