/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser, HTTPRequest, Page} from 'puppeteer-core';

/**
 * A generic class for collecting data from Puppeteer pages. It handles page
 * creation and navigation to manage data collection lifecycle.
 *
 * @template T The type of data to collect.
 * @public
 */
export class PageCollector<T> {
  #browser: Browser;
  #initializer: (page: Page, collector: (item: T) => void) => void;
  /**
   * The Array in this map should only be set once
   * As we use the reference to it.
   * Use methods that manipulate the array in place.
   * @protected
   */
  protected storage = new WeakMap<Page, T[]>();

  /**
   * @param browser - The Puppeteer browser instance.
   * @param initializer - A function that sets up the data collection for a
   * page.
   */
  constructor(
    browser: Browser,
    initializer: (page: Page, collector: (item: T) => void) => void,
  ) {
    this.#browser = browser;
    this.#initializer = initializer;
  }

  /**
   * Initializes the collector by setting up data collection for all existing
   * pages and listening for new pages.
   */
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
  }

  /**
   * Adds a new page to the collector and initializes it.
   *
   * @param page - The page to add.
   */
  public addPage(page: Page) {
    this.#initializePage(page);
  }

  #initializePage(page: Page) {
    if (this.storage.has(page)) {
      return;
    }

    const stored: T[] = [];
    this.storage.set(page, stored);

    page.on('framenavigated', frame => {
      // Only reset the storage on main frame navigation
      if (frame !== page.mainFrame()) {
        return;
      }
      this.cleanup(page);
    });
    this.#initializer(page, value => {
      stored.push(value);
    });
  }

  /**
   * Cleans up the stored data for a page. By default, it clears the entire
   * collection.
   *
   * @param page - The page to clean up.
   * @protected
   */
  protected cleanup(page: Page) {
    const collection = this.storage.get(page);
    if (collection) {
      // Keep the reference alive
      collection.length = 0;
    }
  }

  /**
   * Gets the collected data for a specific page.
   *
   * @param page - The page to get data for.
   * @returns The collected data, or an empty array if none.
   */
  getData(page: Page): T[] {
    return this.storage.get(page) ?? [];
  }
}

/**
 * A specific implementation of PageCollector for collecting network requests.
 * @public
 */
export class NetworkCollector extends PageCollector<HTTPRequest> {
  /**
   * Cleans up network requests by removing all requests before the last
   * navigation.
   *
   * @param page - The page to clean up.
   * @override
   */
  override cleanup(page: Page) {
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
