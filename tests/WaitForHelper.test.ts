/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';
import sinon from 'sinon';

import {WaitForHelper} from '../src/WaitForHelper.js';
import {type Page, type CdpPage} from '../src/third_party/index.js';

class MockPage {
  #client = {
    on() {},
    off() {},
  };

  evaluateHandle() {}
  waitForNavigation() {}
  _client() {
    return this.#client;
  }
}

describe('WaitForHelper', () => {
  it('should wait for stable DOM', async () => {
    const page = new MockPage();
    const helper = new WaitForHelper(page as unknown as Page, 1, 1);
    const evaluateHandle = sinon.stub(page, 'evaluateHandle').resolves({
      evaluate: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    } as any);

    await helper.waitForStableDom();

    assert.ok(evaluateHandle.calledOnce);
  });

  it('should wait for navigation started', async () => {
    const page = new MockPage() as unknown as CdpPage;
    const client = page._client();
    const on = sinon.spy(client, 'on');
    const off = sinon.spy(client, 'off');
    const helper = new WaitForHelper(page as unknown as Page, 1, 1);

    await helper.waitForNavigationStarted();

    assert.ok(on.calledOnceWith('Page.frameStartedNavigating', sinon.match.func));
  });

  it('should wait for events after action', async () => {
    const page = new MockPage();
    const helper = new WaitForHelper(page as unknown as Page, 1, 1);
    const waitForNavigationStarted = sinon.stub(helper, 'waitForNavigationStarted').resolves(true);
    const waitForNavigation = sinon.stub(page, 'waitForNavigation').resolves();
    const waitForStableDom = sinon.stub(helper, 'waitForStableDom').resolves();
    const action = sinon.spy();

    await helper.waitForEventsAfterAction(action);

    assert.ok(waitForNavigationStarted.calledOnce);
    assert.ok(waitForNavigation.calledOnce);
    assert.ok(waitForStableDom.calledOnce);
    assert.ok(action.calledOnce);
  });
});
