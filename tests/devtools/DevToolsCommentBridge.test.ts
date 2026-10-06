/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, beforeEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {DevToolsCommentBridge} from '../../src/devtools/DevToolsCommentBridge.js';
import {createMockPuppeteerPage} from '../mocks.js';

describe('DevToolsCommentBridge', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('attaches to DevTools page and registers function and evaluation', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(bridge.isAttached(devtoolsPage), false);

    assert.strictEqual(await bridge.attach(devtoolsPage), true);

    assert.strictEqual(bridge.isAttached(devtoolsPage), true);
    sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    sinon.assert.calledOnce(devtoolsPage.evaluate);
  });

  it('is idempotent when attaching to the same DevTools page', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), true);
    assert.strictEqual(await bridge.attach(devtoolsPage), true);

    sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    sinon.assert.calledOnce(devtoolsPage.evaluate);
  });

  it('does not attach when the DevTools page has no CD4A bridge', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(false);
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), false);

    assert.strictEqual(bridge.isAttached(devtoolsPage), false);
    sinon.assert.calledOnce(devtoolsPage.evaluate);
    sinon.assert.notCalled(devtoolsPage.exposeFunction);
  });

  it('checks for the CD4A bridge again after a failed attach', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.onFirstCall().resolves(false);
    devtoolsPage.evaluate.onSecondCall().resolves(true);
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), false);
    assert.strictEqual(await bridge.attach(devtoolsPage), true);

    assert.strictEqual(bridge.isAttached(devtoolsPage), true);
    sinon.assert.calledTwice(devtoolsPage.evaluate);
    sinon.assert.calledOnce(devtoolsPage.exposeFunction);
  });

  it('does not attach when evaluation fails', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.rejects(new Error('Target closed'));
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), false);

    assert.strictEqual(bridge.isAttached(devtoolsPage), false);
    sinon.assert.notCalled(devtoolsPage.exposeFunction);
  });

  it('debounces comment notifications', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    const onNotification = sinon.stub();
    let exposedCallback: (() => void) | undefined;

    devtoolsPage.exposeFunction.callsFake((name: string, fn: unknown) => {
      if (name === '__onDevToolsCommentEvent' && typeof fn === 'function') {
        exposedCallback = () => {
          fn();
        };
      }
      return Promise.resolve();
    });

    const bridge = new DevToolsCommentBridge({
      onNotification,
      debounceMs: 150,
    });

    await bridge.attach(devtoolsPage);

    assert.strictEqual(typeof exposedCallback, 'function');
    if (exposedCallback) {
      // Trigger multiple times rapidly
      exposedCallback();
      exposedCallback();
      exposedCallback();
    }

    clock.tick(100);
    sinon.assert.notCalled(onNotification);

    clock.tick(60);
    sinon.assert.calledOnceWithExactly(
      onNotification,
      'DevTools comment threads updated',
    );
  });

  it('clears debounce timer on dispose', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    const onNotification = sinon.stub();
    let exposedCallback: (() => void) | undefined;

    devtoolsPage.exposeFunction.callsFake((name: string, fn: unknown) => {
      if (name === '__onDevToolsCommentEvent' && typeof fn === 'function') {
        exposedCallback = () => {
          fn();
        };
      }
      return Promise.resolve();
    });

    const bridge = new DevToolsCommentBridge({
      onNotification,
      debounceMs: 150,
    });

    await bridge.attach(devtoolsPage);

    assert.strictEqual(typeof exposedCallback, 'function');
    if (exposedCallback) {
      exposedCallback();
    }

    bridge.dispose();

    clock.tick(200);
    sinon.assert.notCalled(onNotification);
    sinon.assert.calledTwice(devtoolsPage.evaluate);
  });

  it('retrieves comments via getComments', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    const bridge = new DevToolsCommentBridge();
    const mockThreads = [
      {
        id: 'comment-1',
        text: 'Check alignment',
      },
    ];
    devtoolsPage.evaluate.resolves(mockThreads);

    const threads = await bridge.getComments(devtoolsPage);

    sinon.assert.calledOnce(devtoolsPage.evaluate);
    assert.deepStrictEqual(threads, mockThreads);
  });
});
