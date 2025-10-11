/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Browser,
  type Frame,
  type Handler,
  type HTTPRequest,
  type Page,
  type PageEvents,
} from 'puppeteer-core';

export type ListenerMap<EventMap extends PageEvents = PageEvents> = {
  [K in keyof EventMap]?: (event: EventMap[K]) => void;
  // request: (event: PageEvents['request']) => void;
};

export class PageCollector<T> {
  #browser: Browser;
  #listenersInitializer: (
    collector: (item: T) => void,
  ) => ListenerMap<PageEvents>;
  #listeners = new WeakMap<Page, ListenerMap>();
  /**
   * The Array in this map should only be set once
   * As we use the reference to it.
   * Use methods that manipulate the array in place.
   */
  protected storage = new WeakMap<Page, T[]>();

  constructor(
    browser: Browser,
    listeners: (collector: (item: T) => void) => ListenerMap<PageEvents>,
  ) {
    this.#browser = browser;
    this.#listenersInitializer = listeners;
  }

  async init() {
    const pages = await this.#browser.pages();
    for (const page of pages) {
      this.#initializePage(page);
    }

    this.#browser.on('targetcreated', async target => {
      const page = await target.page();
      if (!page) {
        return;
      }
      this.#initializePage(page);
    });
    this.#browser.on('targetdestroyed', async target => {
      const page = await target.page();
      if (!page) {
        return;
      }
      this.#cleanupPageDestroyed(page);
    });
  }

  public addPage(page: Page) {
    this.#initializePage(page);
  }

  #initializePage(page: Page) {
    if (this.storage.has(page)) {
      return;
    }

    const stored: T[] = [];
    this.storage.set(page, stored);
    const listeners = this.#listenersInitializer(value => {
      stored.push(value);
    });
    listeners['framenavigated'] = (frame: Frame) => {
      // Only reset the storage on main frame navigation
      if (frame !== page.mainFrame()) {
        return;
      }
      this.cleanupAfterNavigation(page);
    };

    for (const [name, listener] of Object.entries(listeners)) {
      page.on(name, listener as Handler<unknown>);
    }

    this.#listeners.set(page, listeners);
  }

  protected cleanupAfterNavigation(page: Page) {
    const collection = this.storage.get(page);
    if (collection) {
      // Keep the reference alive
      collection.length = 0;
    }
  }

  #cleanupPageDestroyed(page: Page) {
    const listeners = this.#listeners.get(page);
    if (listeners) {
      for (const [name, listener] of Object.entries(listeners)) {
        page.off(name, listener as Handler<unknown>);
      }
    }
  }

  getData(page: Page): T[] {
    return this.storage.get(page) ?? [];
  }
}

export class NetworkCollector extends PageCollector<HTTPRequest> {
  override cleanupAfterNavigation(page: Page) {
    const requests = this.storage.get(page) ?? [];
    if (!requests) {
      return;
    }
    const lastRequestIdx = requests.findLastIndex(request => {
      return request.frame() === page.mainFrame()
        ? request.isNavigationRequest()
        : false;
    });
    // Keep all requests since the last navigation request including that
    // navigation request itself.
    // Keep the reference
    requests.splice(0, Math.max(lastRequestIdx, 0));
  }
}
