/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {IssuesManager, Issue} from '../node_modules/chrome-devtools-frontend/mcp/mcp.js';

import {
  type Browser,
  type Frame,
  type Handler,
  type HTTPRequest,
  type Page,
  type PageEvents as PuppeteerPageEvents,
} from './third_party/index.js';

interface PageEvents extends PuppeteerPageEvents {
  issue: Issue.Issue;
}

export type ListenerMap<EventMap extends PageEvents = PageEvents> = {
  [K in keyof EventMap]?: (event: EventMap[K]) => void;
};

function createIdGenerator() {
  let i = 1;
  return () => {
    if (i === Number.MAX_SAFE_INTEGER) {
      i = 0;
    }
    return i++;
  };
}

export const stableIdSymbol = Symbol('stableIdSymbol');
type WithSymbolId<T> = T & {
  [stableIdSymbol]?: number;
};

export class PageCollector<T> {
  #browser: Browser;
  #listenersInitializer: (
    collector: (item: T) => void,
  ) => ListenerMap<PageEvents>;
  #listeners = new WeakMap<Page, ListenerMap>();
  #seenIssueKeys = new WeakMap<Page, Set<string>>();
  #maxNavigationSaved = 3;
  #includeAllPages?: boolean;

  /**
   * This maps a Page to a list of navigations with a sub-list
   * of all collected resources.
   * The newer navigations come first.
   */
  protected storage = new WeakMap<Page, Array<Array<WithSymbolId<T>>>>();

  constructor(
    browser: Browser,
    listeners: (collector: (item: T) => void) => ListenerMap<PageEvents>,
    includeAllPages?: boolean,
  ) {
    this.#browser = browser;
    this.#listenersInitializer = listeners;
    this.#includeAllPages = includeAllPages;
  }

  async init() {
    const pages = await this.#browser.pages(this.#includeAllPages);
    for (const page of pages) {
      await this.addPage(page);
    }

    this.#browser.on('targetcreated', async target => {
      const page = await target.page();
      if (!page) {
        return;
      }
      await this.addPage(page);
    });
    this.#browser.on('targetdestroyed', async target => {
      const page = await target.page();
      if (!page) {
        return;
      }
      this.#cleanupPageDestroyed(page);
    });
  }

  public async addPage(page: Page) {
    if (this.storage.has(page)) {
      return;
    }
    await this.#initializePage(page);
  }

  async #initializePage(page: Page) {
    await this.subscribeForIssues(page);
    const idGenerator = createIdGenerator();
    const storedLists: Array<Array<WithSymbolId<T>>> = [[]];
    this.storage.set(page, storedLists);

    const listeners = this.#listenersInitializer(value => {
      const withId = value as WithSymbolId<T>;
      withId[stableIdSymbol] = idGenerator();

      const navigations = this.storage.get(page) ?? [[]];
      navigations[0].push(withId);
    });

    listeners['framenavigated'] = (frame: Frame) => {
      // Only split the storage on main frame navigation
      if (frame !== page.mainFrame()) {
        return;
      }
      this.splitAfterNavigation(page);
    };

    for (const [name, listener] of Object.entries(listeners)) {
      page.on(name, listener as Handler<unknown>);
    }

    this.#listeners.set(page, listeners);
  }

  protected async subscribeForIssues(page: Page) {
    if (this instanceof NetworkCollector) return;
    if (!this.#seenIssueKeys.has(page)) {
      this.#seenIssueKeys.set(page, new Set());
    }
    const session = await page.createCDPSession();
    session.on('Audits.issueAdded', data => {// TODO unsubscribe
      // @ts-expect-error Types of protocol from Puppeteer and CDP are incopatible for Issues
      const issue = IssuesManager.createIssuesFromProtocolIssue(null,data.issue)[0]; // returns issue wrapped in array, need to get first element
      if (!issue) {
        return;
      }
      const seenKeys = this.#seenIssueKeys.get(page)!;
      const primaryKey = issue.primaryKey();
      if (seenKeys.has(primaryKey)) return;
      seenKeys.add(primaryKey);
      page.emit('issue', issue);
    });
    await session.send('Audits.enable');
  }

  protected splitAfterNavigation(page: Page) {
    const navigations = this.storage.get(page);
    if (!navigations) {
      return;
    }
    // Add the latest navigation first
    navigations.unshift([]);
    navigations.splice(this.#maxNavigationSaved);
  }

  #cleanupPageDestroyed(page: Page) {
    const listeners = this.#listeners.get(page);
    if (listeners) {
      for (const [name, listener] of Object.entries(listeners)) {
        page.off(name, listener as Handler<unknown>);
      }
    }
    this.storage.delete(page);
    this.#seenIssueKeys.delete(page);
  }

  getData(page: Page, includePreservedData?: boolean): T[] {
    const navigations = this.storage.get(page);
    if (!navigations) {
      return [];
    }

    if (!includePreservedData) {
      return navigations[0];
    }

    const data: T[] = [];

    for (let index = this.#maxNavigationSaved; index >= 0; index--) {
      if (navigations[index]) {
        data.push(...navigations[index]);
      }
    }
    return data;
  }

  getIdForResource(resource: WithSymbolId<T>): number {
    return resource[stableIdSymbol] ?? -1;
  }

  getById(page: Page, stableId: number): T {
    const navigations = this.storage.get(page);
    if (!navigations) {
      throw new Error('No requests found for selected page');
    }

    const item = this.find(page, item => item[stableIdSymbol] === stableId);

    if (item) {
      return item;
    }

    throw new Error('Request not found for selected page');
  }

  find(
    page: Page,
    filter: (item: WithSymbolId<T>) => boolean,
  ): WithSymbolId<T> | undefined {
    const navigations = this.storage.get(page);
    if (!navigations) {
      return;
    }

    for (const navigation of navigations) {
      const item = navigation.find(filter);
      if (item) {
        return item;
      }
    }
    return;
  }
}

export class NetworkCollector extends PageCollector<HTTPRequest> {
  constructor(
    browser: Browser,
    listeners: (
      collector: (item: HTTPRequest) => void,
    ) => ListenerMap<PageEvents> = collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    },
    includeAllPages?: boolean,
  ) {
    super(browser, listeners, includeAllPages);
  }
  override splitAfterNavigation(page: Page) {
    const navigations = this.storage.get(page) ?? [];
    if (!navigations) {
      return;
    }

    const requests = navigations[0];

    const lastRequestIdx = requests.findLastIndex(request => {
      return request.frame() === page.mainFrame()
        ? request.isNavigationRequest()
        : false;
    });

    // Keep all requests since the last navigation request including that
    // navigation request itself.
    // Keep the reference
    if (lastRequestIdx !== -1) {
      const fromCurrentNavigation = requests.splice(lastRequestIdx);
      navigations.unshift(fromCurrentNavigation);
    } else {
      navigations.unshift([]);
    }
  }
}
