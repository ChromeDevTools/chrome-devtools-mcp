/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {UncaughtError} from '../../src/collectors/PageCollector.js';
import {ServiceWorkerConsoleCollector} from '../../src/collectors/ServiceWorkerCollector.js';
import {McpWorker} from '../../src/McpWorker.js';
import {
  createRemoteException,
  TargetType,
  type Protocol,
} from '../../src/third_party/browser.js';
import {stableIdSymbol} from '../../src/utils/id.js';
import {
  createMockCdpJSHandle,
  createMockPuppeteerBrowser,
  createMockPuppeteerTarget,
  createMockWebWorker,
} from '../mocks.js';

describe('ServiceWorkerConsoleCollector', () => {
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
    target.worker.rejects(
      new Error(
        'Protocol error (Target.attachToTarget): No target with given id found',
      ),
    );

    const collector = new ServiceWorkerConsoleCollector(browser);
    await collector.init([new McpWorker('sw-1', 'service_worker', target)]);
    await new Promise(resolve => setTimeout(resolve, 0));
    sinon.assert.calledOnce(target.worker);
    sinon.assert.notCalled(target.createCDPSession);
    collector.dispose();
  });

  it('does not throw when subscribing to a service worker times out', async () => {
    const browser = createMockPuppeteerBrowser();
    const target = createMockPuppeteerTarget({
      url: 'chrome-extension://ext-id/sw.js',
    });
    target.type.returns(TargetType.SERVICE_WORKER);
    target.worker.rejects(new Error('Target.attachToTarget timed out.'));

    const collector = new ServiceWorkerConsoleCollector(browser);
    await collector.init([new McpWorker('sw-1', 'service_worker', target)]);
    await new Promise(resolve => setTimeout(resolve, 0));
    sinon.assert.calledOnce(target.worker);
    sinon.assert.notCalled(target.createCDPSession);
    collector.dispose();
  });

  it('removes the exception listener when the service worker target is destroyed', async () => {
    const browser = createMockPuppeteerBrowser();
    const worker = createMockWebWorker();
    const target = createMockPuppeteerTarget({
      url: 'chrome-extension://ext-id/sw.js',
    });
    target.type.returns(TargetType.SERVICE_WORKER);
    target.worker.resolves(worker);

    const collector = new ServiceWorkerConsoleCollector(browser);
    await collector.init([new McpWorker('sw-1', 'service_worker', target)]);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(worker.listenerCount('exception'), 1);

    browser.emit('targetdestroyed', target);

    assert.strictEqual(worker.listenerCount('exception'), 0);
    collector.dispose();
  });

  it('collects uncaught errors from worker exception events', async () => {
    const browser = createMockPuppeteerBrowser();
    const worker = createMockWebWorker();
    const target = createMockPuppeteerTarget({
      url: 'chrome-extension://ext-id/sw.js',
    });
    target.type.returns(TargetType.SERVICE_WORKER);
    target.worker.resolves(worker);

    const collector = new ServiceWorkerConsoleCollector(browser);
    await collector.init([new McpWorker('sw-1', 'service_worker', target)]);
    await new Promise(resolve => setTimeout(resolve, 0));

    const remoteObject: Protocol.Runtime.RemoteObject = {
      type: 'object',
      description: 'Error: boom',
    };
    const handle = createMockCdpJSHandle(remoteObject, worker.client);
    const details: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 1,
      exception: remoteObject,
      text: 'Uncaught',
      lineNumber: 0,
      columnNumber: 0,
      stackTrace: {callFrames: []},
    };
    worker.emit('exception', createRemoteException(details, handle));

    sinon.assert.calledOnce(handle.move);
    sinon.assert.notCalled(target.createCDPSession);
    const logs = collector.getData('ext-id');
    assert.strictEqual(logs.length, 1);
    assert.ok(logs[0] instanceof UncaughtError);
    assert.strictEqual(logs[0].details, details);
    assert.strictEqual(logs[0].targetId, 'ext-id');
    assert.strictEqual(logs[0].session, worker.client);
    collector.dispose();
  });
});
