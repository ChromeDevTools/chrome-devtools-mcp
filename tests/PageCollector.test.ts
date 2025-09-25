/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {Browser, Frame, Page, PageEvents} from 'puppeteer-core';

import {PageCollector} from '../src/PageCollector.js';

import {getMockRequest} from './utils.js';

function getMockPage(): Page {
  const listeners: Record<keyof PageEvents, (data: unknown) => void> = {};
  const mainFrame = {} as Frame;
  return {
    on(eventName, listener) {
      listeners[eventName] = listener;
    },
    emit(eventName, data) {
      listeners[eventName]?.(data);
    },
    mainFrame() {
      return mainFrame;
    },
  } as Page;
}

function getMockBrowser(): Browser {
  const pages = [getMockPage()];
  return {
    pages() {
      return Promise.resolve(pages);
    },
    on(_type, _handler) {
      // Mock
    },
  } as Browser;
}

describe('PageCollector', () => {
  it('works', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, (page, collect) => {
      page.on('request', req => {
        collect(req);
      });
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
    const collector = new PageCollector(browser, (page, collect) => {
      page.on('request', req => {
        collect(req);
      });
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
    const collector = new PageCollector(browser, (page, collect) => {
      page.on('request', req => {
        collect(req);
      });
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
    const collector = new PageCollector(browser, (page, collect) => {
      page.on('request', req => {
        collect(req);
      });
    });
    await collector.init();
    page.emit('request', request);

    assert.equal(collector.getData(page)[0], request);
    page.emit('framenavigated', mainFrame);

    assert.equal(collector.getData(page).length, 0);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 1);
  });
});
