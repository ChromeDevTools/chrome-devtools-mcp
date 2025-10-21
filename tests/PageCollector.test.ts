/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {Browser, Frame, HTTPRequest, Page, Target} from 'puppeteer-core';

import type {ListenerMap} from '../src/PageCollector.js';
import {NetworkCollector, PageCollector} from '../src/PageCollector.js';

import {getMockRequest} from './utils.js';

function mockListener() {
  const listeners: Record<string, Array<(data: unknown) => void>> = {};
  return {
    on(eventName: string, listener: (data: unknown) => void) {
      if (listeners[eventName]) {
        listeners[eventName].push(listener);
      } else {
        listeners[eventName] = [listener];
      }
    },
    off(_eventName: string, _listener: (data: unknown) => void) {
      // no-op
    },
    emit(eventName: string, data: unknown) {
      for (const listener of listeners[eventName] ?? []) {
        listener(data);
      }
    },
  };
}

function getMockPage(): Page {
  const mainFrame = {} as Frame;
  return {
    mainFrame() {
      return mainFrame;
    },
    ...mockListener(),
  } as Page;
}

function getMockBrowser(): Browser {
  const pages = [getMockPage()];
  return {
    pages() {
      return Promise.resolve(pages);
    },
    ...mockListener(),
  } as Browser;
}

describe('PageCollector', () => {
  it('works', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init();
    page.emit('request', request);

    assert.equal(collector.getData(page)[0], request);
  });

  it('clean up after navigation', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init();
    page.emit('request', request);

    assert.equal(collector.getData(page)[0], request);
    page.emit('framenavigated', mainFrame);

    assert.equal(collector.getData(page).length, 0);
  });

  it('does not clean up after sub frame navigation', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init();
    page.emit('request', request);
    page.emit('framenavigated', {} as Frame);

    assert.equal(collector.getData(page).length, 1);
  });

  it('clean up after navigation and be able to add data after', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init();
    page.emit('request', request);

    assert.equal(collector.getData(page)[0], request);
    page.emit('framenavigated', mainFrame);

    assert.equal(collector.getData(page).length, 0);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 1);
  });

  it('should only subscribe once', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init();
    browser.emit('targetcreated', {
      page() {
        return Promise.resolve(page);
      },
    } as Target);

    // The page inside part is async so we need to await some time
    await new Promise<void>(res => res());

    assert.equal(collector.getData(page).length, 0);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 1);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 2);
  });

  it('should clear data on page destroy', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init();

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 1);

    browser.emit('targetdestroyed', {
      page() {
        return Promise.resolve(page);
      },
    } as Target);

    // The page inside part is async so we need to await some time
    await new Promise<void>(res => res());

    assert.equal(collector.getData(page).length, 0);
  });

  it('should assign ids to requests', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request1 = getMockRequest();
    const request2 = getMockRequest();
    const collector = new PageCollector<HTTPRequest>(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init();

    page.emit('request', request1);
    page.emit('request', request2);

    assert.equal(collector.getData(page).length, 2);

    assert.equal(collector.getIdForResource(request1), 1);
    assert.equal(collector.getIdForResource(request2), 2);
  });
});

describe('NetworkCollector', () => {
  it('correctly picks up navigation requests to latest navigation', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const request = getMockRequest();
    const navRequest = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const request2 = getMockRequest();
    const collector = new NetworkCollector(browser);
    await collector.init();
    page.emit('request', request);
    page.emit('request', navRequest);

    assert.equal(collector.getData(page)[0], request);
    assert.equal(collector.getData(page)[1], navRequest);
    page.emit('framenavigated', mainFrame);

    assert.equal(collector.getData(page).length, 1);
    assert.equal(collector.getData(page)[0], navRequest);

    page.emit('request', request2);

    assert.equal(collector.getData(page).length, 2);
    assert.equal(collector.getData(page)[0], navRequest);
    assert.equal(collector.getData(page)[1], request2);
  });

  it('correctly picks up after multiple back to back navigations', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const navRequest = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const navRequest2 = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const request = getMockRequest();

    const collector = new NetworkCollector(browser);
    await collector.init();
    page.emit('request', navRequest);
    assert.equal(collector.getData(page)[0], navRequest);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page).length, 1);
    assert.equal(collector.getData(page)[0], navRequest);

    page.emit('request', navRequest2);
    assert.equal(collector.getData(page).length, 2);
    assert.equal(collector.getData(page)[0], navRequest);
    assert.equal(collector.getData(page)[1], navRequest2);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page).length, 1);
    assert.equal(collector.getData(page)[0], navRequest2);

    page.emit('request', request);
    assert.equal(collector.getData(page).length, 2);
  });

  it('works with previous navigations', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const navRequest = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const navRequest2 = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const request = getMockRequest();

    const collector = new NetworkCollector(browser);
    await collector.init();
    page.emit('request', navRequest);
    assert.equal(collector.getData(page, true).length, 1);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page, true).length, 1);

    page.emit('request', navRequest2);
    assert.equal(collector.getData(page, true).length, 2);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page, true).length, 2);

    page.emit('request', request);
    assert.equal(collector.getData(page, true).length, 3);
  });
});
