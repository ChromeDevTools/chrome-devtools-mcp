/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {beforeEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {DevToolsCommentBridge} from '../../src/devtools/DevToolsCommentBridge.js';
import {createMockPuppeteerPage} from '../mocks.js';

describe('DevToolsCommentBridge', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  it('attaches to DevTools page and registers function and evaluation', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(bridge.isAttached(devtoolsPage), false);

    assert.strictEqual(await bridge.attach(devtoolsPage), true);

    assert.strictEqual(bridge.isAttached(devtoolsPage), true);
    sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    sinon.assert.calledTwice(devtoolsPage.evaluate);
  });

  it('is idempotent when attaching to the same DevTools page', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), true);
    assert.strictEqual(await bridge.attach(devtoolsPage), true);

    sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    sinon.assert.calledTwice(devtoolsPage.evaluate);
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
    devtoolsPage.evaluate.resolves(true);
    devtoolsPage.evaluate.onFirstCall().resolves(false);
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), false);
    assert.strictEqual(await bridge.attach(devtoolsPage), true);

    assert.strictEqual(bridge.isAttached(devtoolsPage), true);
    sinon.assert.calledThrice(devtoolsPage.evaluate);
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

  it('attaches when the comment event binding already exists', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    devtoolsPage.exposeFunction.rejects(
      new Error(
        "Failed to add page binding with name __onDevToolsCommentEvent: window['__onDevToolsCommentEvent'] already exists!",
      ),
    );
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), true);

    assert.strictEqual(bridge.isAttached(devtoolsPage), true);
    sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    sinon.assert.calledTwice(devtoolsPage.evaluate);
  });

  it('does not attach when the comment event binding is unavailable', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.onFirstCall().resolves(true);
    devtoolsPage.evaluate.onSecondCall().resolves(false);
    devtoolsPage.exposeFunction.rejects(new Error('Target closed'));
    const bridge = new DevToolsCommentBridge();

    assert.strictEqual(await bridge.attach(devtoolsPage), false);

    assert.strictEqual(bridge.isAttached(devtoolsPage), false);
    sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    sinon.assert.calledTwice(devtoolsPage.evaluate);
  });

  it('debounces comment events', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    let exposedCallback: (() => void) | undefined;

    devtoolsPage.exposeFunction.callsFake((name: string, fn: unknown) => {
      if (name === '__onDevToolsCommentEvent' && typeof fn === 'function') {
        exposedCallback = () => {
          fn();
        };
      }
      return Promise.resolve();
    });

    const bridge = new DevToolsCommentBridge({debounceMs: 150});

    await bridge.attach(devtoolsPage);

    const waiting = bridge.waitForCommentEvent(10_000);
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });

    assert.strictEqual(typeof exposedCallback, 'function');
    if (exposedCallback) {
      // Trigger multiple times rapidly
      exposedCallback();
      exposedCallback();
      exposedCallback();
    }

    await clock.tickAsync(100);
    assert.strictEqual(settled, false);

    await clock.tickAsync(60);
    assert.strictEqual(await waiting, true);
  });

  it('clears debounce timer on dispose', async () => {
    const devtoolsPage = createMockPuppeteerPage();
    devtoolsPage.evaluate.resolves(true);
    let exposedCallback: (() => void) | undefined;

    devtoolsPage.exposeFunction.callsFake((name: string, fn: unknown) => {
      if (name === '__onDevToolsCommentEvent' && typeof fn === 'function') {
        exposedCallback = () => {
          fn();
        };
      }
      return Promise.resolve();
    });

    const bridge = new DevToolsCommentBridge({debounceMs: 150});

    await bridge.attach(devtoolsPage);

    const waiting = bridge.waitForCommentEvent(10_000);
    assert.strictEqual(typeof exposedCallback, 'function');
    if (exposedCallback) {
      exposedCallback();
    }

    bridge.dispose();

    await clock.tickAsync(200);
    assert.strictEqual(await waiting, false);
    sinon.assert.calledThrice(devtoolsPage.evaluate);
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

  describe('waitForCommentEvent', () => {
    async function attachWithCallback(bridge: DevToolsCommentBridge) {
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(true);
      let exposedCallback: (() => void) | undefined;
      devtoolsPage.exposeFunction.callsFake((name: string, fn: unknown) => {
        if (name === '__onDevToolsCommentEvent' && typeof fn === 'function') {
          exposedCallback = () => {
            fn();
          };
        }
        return Promise.resolve();
      });
      await bridge.attach(devtoolsPage);
      assert.ok(exposedCallback);
      return exposedCallback;
    }

    it('resolves true after the debounced comment event', async () => {
      const bridge = new DevToolsCommentBridge({debounceMs: 150});
      const fireEvent = await attachWithCallback(bridge);

      const waiting = bridge.waitForCommentEvent(10_000);
      fireEvent();
      await clock.tickAsync(150);

      assert.strictEqual(await waiting, true);
    });

    it('resolves false at timeout when no event fires', async () => {
      const bridge = new DevToolsCommentBridge({debounceMs: 150});
      await attachWithCallback(bridge);

      const waiting = bridge.waitForCommentEvent(1_000);
      await clock.tickAsync(1_000);

      assert.strictEqual(await waiting, false);
    });

    it('resolves false when the bridge is disposed during the wait', async () => {
      const bridge = new DevToolsCommentBridge({debounceMs: 150});
      await attachWithCallback(bridge);

      const waiting = bridge.waitForCommentEvent(10_000);
      bridge.dispose();

      assert.strictEqual(await waiting, false);
    });

    it('resolves all concurrent waiters on one event', async () => {
      const bridge = new DevToolsCommentBridge({debounceMs: 150});
      const fireEvent = await attachWithCallback(bridge);

      const first = bridge.waitForCommentEvent(10_000);
      const second = bridge.waitForCommentEvent(10_000);
      fireEvent();
      await clock.tickAsync(150);

      assert.deepStrictEqual(await Promise.all([first, second]), [true, true]);
    });

    it('does not resolve a later waiter with an earlier event', async () => {
      const bridge = new DevToolsCommentBridge({debounceMs: 150});
      const fireEvent = await attachWithCallback(bridge);

      fireEvent();
      await clock.tickAsync(150);
      const waiting = bridge.waitForCommentEvent(1_000);
      await clock.tickAsync(1_000);

      assert.strictEqual(await waiting, false);
    });
  });
});
