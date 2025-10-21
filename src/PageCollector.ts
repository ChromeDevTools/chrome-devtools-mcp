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
} from './third_party/index.js';

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
  #maxNavigationSaved = 3;

  /**
   * This maps a Page to a list of navigations with a sub-list
   * of all collected resources.
   * The newer navigations come first.
   */
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
  }

  getData(page: Page, includePreviousNavigations?: boolean): T[] {
    const navigations = this.storage.get(page);
    if (!navigations) {
      return [];
    }

    if (!includePreviousNavigations) {
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

    for (const navigation of navigations) {
      for (const collected of navigation) {
        if (collected[stableIdSymbol] === stableId) {
          return collected;
        }
      }
    }

    throw new Error('Request not found for selected page');
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
