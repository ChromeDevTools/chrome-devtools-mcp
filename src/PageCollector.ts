/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {FakeIssuesManager} from './devtools/DevtoolsUtils.js';
import type {
  CDPSession,
  ConsoleMessage,
  Protocol,
  Issue,
} from './third_party/index.js';
import {DevTools} from './third_party/index.js';
import {
  type Frame,
  type Handler,
  type HTTPRequest,
  type Page,
  type PageEvents as PuppeteerPageEvents,
} from './third_party/index.js';
import {
  createIdGenerator,
  stableIdSymbol,
  type WithSymbolId,
} from './utils/id.js';
import {logger} from './utils/logger.js';

export class UncaughtError {
  readonly details: Protocol.Runtime.ExceptionDetails;
  readonly targetId: string;

  constructor(details: Protocol.Runtime.ExceptionDetails, targetId: string) {
    this.details = details;
    this.targetId = targetId;
  }
}

interface PageEvents extends PuppeteerPageEvents {
  devtoolsAggregatedIssue: DevTools.AggregatedIssue;
  uncaughtError: UncaughtError;
}

export type ListenerMap<EventMap extends PageEvents = PageEvents> = {
  [K in keyof EventMap]?: (event: EventMap[K]) => void;
};

export class PageCollector<T> {
  protected pptrPage: Page;
  #listeners?: ListenerMap<PageEvents>;
  protected maxNavigationSaved = 3;

  /**
   * This maps a Page to a list of navigations with a sub-list
   * of all collected resources.
   * The newer navigations come first.
   */
  protected storage: Array<Array<WithSymbolId<T>>> = [[]];

  constructor(
    page: Page,
    listeners: (collector: (item: T) => void) => ListenerMap<PageEvents>,
  ) {
    this.pptrPage = page;

    const idGenerator = createIdGenerator();

    const listenerMap = listeners(value => {
      const withId = value as WithSymbolId<T>;
      withId[stableIdSymbol] = idGenerator();
      this.storage[0].push(withId);
    });

    listenerMap['framenavigated'] = (frame: Frame) => {
      // Only split the storage on main frame navigation
      if (frame !== this.pptrPage.mainFrame()) {
        return;
      }
      this.splitAfterNavigation();
    };

    for (const [name, listener] of Object.entries(listenerMap)) {
      this.pptrPage.on(name, listener as Handler<unknown>);
    }

    this.#listeners = listenerMap;
  }

  dispose() {
    if (this.#listeners) {
      for (const [name, listener] of Object.entries(this.#listeners)) {
        this.pptrPage.off(name, listener as Handler<unknown>);
      }
    }
  }

  protected splitAfterNavigation() {
    // Add the latest navigation first
    this.storage.unshift([]);
    this.storage.splice(this.maxNavigationSaved);
  }

  getData(includePreservedData?: boolean): T[] {
    if (!includePreservedData) {
      return this.storage[0];
    }

    const data: T[] = [];
    for (let index = this.maxNavigationSaved; index >= 0; index--) {
      if (this.storage[index]) {
        data.push(...this.storage[index]);
      }
    }
    return data;
  }

  getIdForResource(resource: WithSymbolId<T>): number {
    return resource[stableIdSymbol] ?? -1;
  }

  getById(stableId: number): T {
    const item = this.find(item => item[stableIdSymbol] === stableId);

    if (!item) {
      throw new Error('Request not found for selected page');
    }

    return item;
  }

  find(
    filter: (item: WithSymbolId<T>) => boolean,
  ): WithSymbolId<T> | undefined {
    for (const navigation of this.storage) {
      const item = navigation.find(filter);
      if (item) {
        return item;
      }
    }
    return;
  }
}

export class ConsoleCollector extends PageCollector<
  ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError
> {
  #subscriber?: PageEventSubscriber;

  constructor(
    page: Page,
    listeners: (
      collector: (
        item: ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError,
      ) => void,
    ) => ListenerMap<PageEvents>,
  ) {
    super(page, listeners);
    this.#subscriber = new PageEventSubscriber(this.pptrPage);
    this.#subscriber.subscribe();
  }

  override dispose(): void {
    super.dispose();
    this.#subscriber?.unsubscribe();
  }
}

class PageEventSubscriber {
  #issueManager = new FakeIssuesManager();
  #issueAggregator = new DevTools.IssueAggregator(this.#issueManager);
  #seenKeys = new Set<string>();
  #seenIssues = new Set<DevTools.AggregatedIssue>();
  #page: Page;
  #session: CDPSession;
  #targetId: string;

  constructor(page: Page) {
    this.#page = page;
    // @ts-expect-error use existing CDP client (internal Puppeteer API).
    this.#session = this.#page._client() as CDPSession;
    // @ts-expect-error use internal Puppeteer API to get target ID
    this.#targetId = this.#session.target()._targetId;
  }

  #resetIssueAggregator() {
    this.#issueManager = new FakeIssuesManager();
    if (this.#issueAggregator) {
      this.#issueAggregator.removeEventListener(
        DevTools.IssueAggregatorEvents.AGGREGATED_ISSUE_UPDATED,
        this.#onAggregatedIssue,
      );
    }
    this.#issueAggregator = new DevTools.IssueAggregator(this.#issueManager);
    this.#issueAggregator.addEventListener(
      DevTools.IssueAggregatorEvents.AGGREGATED_ISSUE_UPDATED,
      this.#onAggregatedIssue,
    );
  }

  subscribe() {
    this.#resetIssueAggregator();
    this.#page.on('framenavigated', this.#onFrameNavigated);
    this.#page.on('issue', this.#onIssueAdded);
    this.#session.on('Runtime.exceptionThrown', this.#onExceptionThrown);
  }

  unsubscribe() {
    this.#seenKeys.clear();
    this.#seenIssues.clear();
    this.#page.off('framenavigated', this.#onFrameNavigated);
    this.#page.off('issue', this.#onIssueAdded);
    this.#session.off('Runtime.exceptionThrown', this.#onExceptionThrown);
    if (this.#issueAggregator) {
      this.#issueAggregator.removeEventListener(
        DevTools.IssueAggregatorEvents.AGGREGATED_ISSUE_UPDATED,
        this.#onAggregatedIssue,
      );
    }
  }

  #onAggregatedIssue = (
    event: DevTools.Common.EventTarget.EventTargetEvent<DevTools.AggregatedIssue>,
  ) => {
    if (this.#seenIssues.has(event.data)) {
      return;
    }
    this.#seenIssues.add(event.data);
    this.#page.emit('devtoolsAggregatedIssue', event.data);
  };

  #onExceptionThrown = (event: Protocol.Runtime.ExceptionThrownEvent) => {
    this.#page.emit(
      'uncaughtError',
      new UncaughtError(event.exceptionDetails, this.#targetId),
    );
  };

  // On navigation, we reset issue aggregation.
  #onFrameNavigated = (frame: Frame) => {
    // Only split the storage on main frame navigation
    if (frame !== frame.page().mainFrame()) {
      return;
    }
    this.#seenKeys.clear();
    this.#seenIssues.clear();
    this.#resetIssueAggregator();
  };

  #onIssueAdded = (inspectorIssue: Issue) => {
    try {
      // DevTools currently defines this protocol issue code but has no
      // IssuesManager handler for it, so calling into the mapper only warns.
      if (String(inspectorIssue.code) === 'PerformanceIssue') {
        return;
      }
      const issue = DevTools.createIssuesFromProtocolIssue(
        null,
        // @ts-expect-error Protocol types diverge.
        inspectorIssue,
      )[0];
      if (!issue) {
        logger?.('No issue mapping for for the issue: ', inspectorIssue.code);
        return;
      }

      const primaryKey = issue.primaryKey();
      if (this.#seenKeys.has(primaryKey)) {
        return;
      }
      this.#seenKeys.add(primaryKey);
      this.#issueManager.dispatchEventToListeners(
        DevTools.IssuesManagerEvents.ISSUE_ADDED,
        {
          issue,
          // @ts-expect-error We don't care that issues model is null
          issuesModel: null,
        },
      );
    } catch (error) {
      logger?.('Error creating a new issue', error);
    }
  };
}

export class NetworkCollector extends PageCollector<HTTPRequest> {
  constructor(
    page: Page,
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
    super(page, listeners);
  }
  override splitAfterNavigation() {
    const requests = this.storage[0];

    const lastRequestIdx = requests.findLastIndex(request => {
      return request.frame() === this.pptrPage.mainFrame()
        ? request.isNavigationRequest()
        : false;
    });

    // Keep all requests since the last navigation request including that
    // navigation request itself.
    // Keep the reference
    if (lastRequestIdx !== -1) {
      const fromCurrentNavigation = requests.splice(lastRequestIdx);
      this.storage.unshift(fromCurrentNavigation);
    } else {
      this.storage.unshift([]);
    }
    this.storage.splice(this.maxNavigationSaved);
  }
}
