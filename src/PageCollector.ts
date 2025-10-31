/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AggregatedIssue,
  AggregatorEvents,
  IssuesManager,
  IssueAggregator,
} from '../node_modules/chrome-devtools-frontend/mcp/mcp.js';

import {FakeIssuesManager} from './DevtoolsUtils.js';
import {
  type Browser,
  type Frame,
  type Handler,
  type HTTPRequest,
  type Page,
  type PageEvents as PuppeteerPageEvents,
} from './third_party/index.js';

interface PageEvents extends PuppeteerPageEvents {
  issue: AggregatedIssue;
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

  // Store an aggregator and a mock manager for each page.
  #issuesAggregators = new WeakMap<Page, IssueAggregator>();
  #mockIssuesManagers = new WeakMap<Page, FakeIssuesManager>();

  protected storage = new WeakMap<Page, Array<Array<WithSymbolId<T>>>>();

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
    const idGenerator = createIdGenerator();
    const storedLists: Array<Array<WithSymbolId<T>>> = [[]];
    this.storage.set(page, storedLists);

    // This is the single function responsible for adding items to storage.
    const collector = (value: T) => {
      const withId = value as WithSymbolId<T>;
      // Assign an ID only if it's a new item.
      if (!withId[stableIdSymbol]) {
        withId[stableIdSymbol] = idGenerator();
      }

      const navigations = this.storage.get(page) ?? [[]];
      const currentNavigation = navigations[0];

      // The aggregator sends the same object instance for updates, so we just
      // need to ensure it's in the list.
      if (!currentNavigation.includes(withId)) {
        currentNavigation.push(withId);
      }
    };

    await this.subscribeForIssues(page);

    const listeners = this.#listenersInitializer(collector);

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
    if (this instanceof NetworkCollector) {
      return;
    }
    if (!this.#seenIssueKeys.has(page)) {
      this.#seenIssueKeys.set(page, new Set());
    }

    const mockManager = new FakeIssuesManager();
    // @ts-expect-error Aggregator receives partial IssuesManager
    const aggregator = new IssueAggregator(mockManager);
    this.#mockIssuesManagers.set(page, mockManager);
    this.#issuesAggregators.set(page, aggregator);

    aggregator.addEventListener(
      AggregatorEvents.AGGREGATED_ISSUE_UPDATED,
      event => {
        page.emit('issue', event.data);
      },
    );

    const session = await page.createCDPSession();
    session.on('Audits.issueAdded', data => {
      // @ts-expect-error Types of protocol from Puppeteer and CDP are incopatible for Issues but it's the same type
      const issue = IssuesManager.createIssuesFromProtocolIssue(null,data.issue,)[0];
      if (!issue) {
        return;
      }
      const seenKeys = this.#seenIssueKeys.get(page)!;
      const primaryKey = issue.primaryKey();
      if (seenKeys.has(primaryKey)) return;
      seenKeys.add(primaryKey);

      // Trigger the aggregator via our mock manager. Do NOT call collector() here.
      const mockManager = this.#mockIssuesManagers.get(page);
      if (mockManager) {
        // @ts-expect-error we don't care about issies model being null
        mockManager.dispatchEventToListeners(IssuesManager.Events.ISSUE_ADDED, {issue, issuesModel: null});
      }
    });
    await session.send('Audits.enable');
  }

  protected splitAfterNavigation(page: Page) {
    const navigations = this.storage.get(page);
    if (!navigations) {
      return;
    }
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
    this.#issuesAggregators.delete(page);
    this.#mockIssuesManagers.delete(page);
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
  ) {
    super(browser, listeners);
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

    if (lastRequestIdx !== -1) {
      const fromCurrentNavigation = requests.splice(lastRequestIdx);
      navigations.unshift(fromCurrentNavigation);
    } else {
      navigations.unshift([]);
    }
  }
}