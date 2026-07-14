/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {createTargetUniverse} from '../../src/devtools/DevtoolsUtils.js';
import {DevTools} from '../../src/third_party/index.js';
import {serverHooks} from '../server.js';
import {html, withBrowser} from '../utils.js';

describe('createTargetUniverse', () => {
  const server = serverHooks();

  afterEach(() => {
    sinon.restore();
  });

  it('works with a real browser', async () => {
    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );

      assert.notStrictEqual(targetUniverse, null);
    });
  });

  it('ignores pauses', async () => {
    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );
      assert.ok(targetUniverse);
      const model = targetUniverse.target.model(DevTools.DebuggerModel);
      assert.ok(model);

      const pausedSpy = sinon.stub();
      model.addEventListener('DebuggerPaused' as any, pausedSpy); // eslint-disable-line

      const result = await page.evaluate('debugger; 1 + 1');
      assert.strictEqual(result, 2);

      sinon.assert.notCalled(pausedSpy);
    });
  });

  it('disables network domain', async () => {
    server.addHtmlRoute('/test', html`<div>Test</div>`);

    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );
      assert.ok(targetUniverse);

      const networkManager = targetUniverse.target.model(
        DevTools.NetworkManager.NetworkManager,
      );
      assert.ok(networkManager);

      const requestStartedSpy = sinon.stub();
      networkManager.addEventListener(
        DevTools.NetworkManager.Events.RequestStarted,
        requestStartedSpy,
      );

      await page.goto(server.getRoute('/test'));

      sinon.assert.notCalled(requestStartedSpy);
    });
  });
});
