/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser, HTTPRequest, Page, HTTPResponse} from 'puppeteer-core';

export interface PreservedNetworkRequest {
  request: HTTPRequest;
  timestamp: number;
  requestBody?: string;
  responseBody?: string;
}

export class PageCollector<T> {
  #browser: Browser;
  #initializer: (page: Page, collector: (item: T) => void) => void;
  protected storage = new WeakMap<Page, T[]>();

  constructor(
    browser: Browser,
    initializer: (page: Page, collector: (item: T) => void) => void,
  ) {
    this.#browser = browser;
    this.#initializer = initializer;
  }

  protected getBrowser(): Browser {
    return this.#browser;
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

  protected cleanup(page: Page) {
    const collection = this.storage.get(page);
    if (collection) {
      // Keep the reference alive
      collection.length = 0;
    }
  }

  getData(page: Page): T[] {
    return this.storage.get(page) ?? [];
  }
}

export class NetworkCollector extends PageCollector<HTTPRequest> {
  #preservationEnabled = false;
  #includeRequestBodies = true;
  #includeResponseBodies = true;
  #maxRequests?: number;
  #preservedData = new WeakMap<Page, PreservedNetworkRequest[]>();

  enablePreservation(options?: {
    includeRequestBodies?: boolean;
    includeResponseBodies?: boolean;
    maxRequests?: number;
  }): void {
    this.#preservationEnabled = true;
    this.#includeRequestBodies = options?.includeRequestBodies ?? true;
    this.#includeResponseBodies = options?.includeResponseBodies ?? true;
    this.#maxRequests = options?.maxRequests;
  }

  disablePreservation(): void {
    this.#preservationEnabled = false;
  }

  isPreservationEnabled(): boolean {
    return this.#preservationEnabled;
  }

  clearPreservedData(page: Page): void {
    const preserved = this.#preservedData.get(page);
    if (preserved) {
      preserved.length = 0;
    }
  }

  getPreservedData(page: Page): PreservedNetworkRequest[] {
    return this.#preservedData.get(page) ?? [];
  }

  async #captureRequestData(request: HTTPRequest): Promise<PreservedNetworkRequest> {
    const preserved: PreservedNetworkRequest = {
      request,
      timestamp: Date.now(),
    };

    if (this.#includeRequestBodies) {
      try {
        const postData = request.postData();
        if (postData) {
          preserved.requestBody = postData;
        }
      } catch (error) {
      }
    }

    if (this.#includeResponseBodies) {
      try {
        const response = request.response();
        if (response) {
          const buffer = await response.buffer();
          const contentType = response.headers()['content-type'] || '';
          
          if (contentType.includes('text/') || 
              contentType.includes('application/json') ||
              contentType.includes('application/xml') ||
              contentType.includes('application/javascript')) {
            preserved.responseBody = buffer.toString('utf-8');
          } else {
            preserved.responseBody = `[Binary data: ${contentType}, ${buffer.length} bytes]`;
          }
        }
      } catch (error) {
      }
    }

    return preserved;
  }

  override cleanup(page: Page) {
    if (this.#preservationEnabled) {
      return;
    }

    const requests = this.storage.get(page) ?? [];
    if (!requests) {
      return;
    }
    const lastRequestIdx = requests.findLastIndex(request => {
      return request.frame() === page.mainFrame()
        ? request.isNavigationRequest()
        : false;
    });
    requests.splice(0, Math.max(lastRequestIdx, 0));
  }

  public override addPage(page: Page): void {
    super.addPage(page);
    
    if (this.#preservationEnabled) {
      if (!this.#preservedData.has(page)) {
        this.#preservedData.set(page, []);
      }

      page.on('requestfinished', async (request: HTTPRequest) => {
        const preserved = this.#preservedData.get(page);
        if (!preserved) return;

        const data = await this.#captureRequestData(request);
        preserved.push(data);

        if (this.#maxRequests && preserved.length > this.#maxRequests) {
          preserved.shift();
        }
      });
    }
  }

  override async init() {
    await super.init();
    
    if (this.#preservationEnabled) {
      const pages = await this.getBrowser().pages();
      for (const page of pages) {
        if (!this.#preservedData.has(page)) {
          this.#preservedData.set(page, []);
        }
      }
    }
  }
}
