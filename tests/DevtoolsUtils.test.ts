/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {
  extractUrlLikeFromDevToolsTitle,
  urlsEqual,
  UniverseManager,
} from '../src/DevtoolsUtils.js';
import {DevTools} from '../src/third_party/index.js';
import type {Browser, Target} from '../src/third_party/index.js';

import {
  getMockBrowser,
  getMockPage,
  mockListener,
  withBrowser,
} from './utils.js';

describe('extractUrlFromDevToolsTitle', () => {
  it('deals with no trailing /', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - example.com'),
      'example.com',
    );
  });
  it('deals with a trailing /', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - example.com/'),
      'example.com/',
    );
  });
  it('deals with www', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - www.example.com/'),
      'www.example.com/',
    );
  });
  it('deals with complex url', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle(
        'DevTools - www.example.com/path.html?a=b#3',
      ),
      'www.example.com/path.html?a=b#3',
    );
  });
});

describe('urlsEqual', () => {
  it('ignores trailing slashes', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://google.com'),
      true,
    );
  });

  it('ignores www', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://www.google.com'),
      true,
    );
  });

  it('ignores protocols', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'http://www.google.com'),
      true,
    );
  });

  it('does not ignore other subdomains', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://photos.google.com'),
      false,
    );
  });

  it('ignores hash', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/#', 'http://www.google.com'),
      true,
    );
    assert.strictEqual(
      urlsEqual('https://google.com/#21', 'http://www.google.com#12'),
      true,
    );
  });
});

describe('UniverseManager', () => {
  it('calls the factory for existing pages', async () => {
    const browser = getMockBrowser();
    const factory = sinon.stub().resolves({});
    const manager = new UniverseManager(browser, factory);
    await manager.init(await browser.pages());

    const page = (await browser.pages())[0];
    sinon.assert.calledOnceWithExactly(factory, page);
  });

  it('calls the factory only once for the same page', async () => {
    const browser = {
      ...mockListener(),
    } as unknown as Browser;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const factory = sinon.stub().returns(new Promise(() => {})); // Don't resolve.
    const manager = new UniverseManager(browser, factory);
    await manager.init([]);

    sinon.assert.notCalled(factory);

    const page = getMockPage();
    browser.emit('targetcreated', {
      page: () => Promise.resolve(page),
    } as Target);
    browser.emit('targetcreated', {
      page: () => Promise.resolve(page),
    } as Target);

    await new Promise(r => setTimeout(r, 0)); // One event loop tick for the micro task queue to run.

    sinon.assert.calledOnceWithExactly(factory, page);
  });

  it('works with a real browser', async () => {
    await withBrowser(async (browser, page) => {
      const manager = new UniverseManager(browser);
      await manager.init([page]);

      assert.notStrictEqual(manager.get(page), null);
    });
  });

  it('ignores pauses', async () => {
    await withBrowser(async (browser, page) => {
      const manager = new UniverseManager(browser);
      await manager.init([page]);
      const targetUniverse = manager.get(page);
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
});
