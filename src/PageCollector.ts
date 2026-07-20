/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {FakeIssuesManager} from './devtools/DevtoolsUtils.js';
import type {
  CDPSession,
  ConsoleMessage,
  ConsoleMessageType,
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

/**
 * A console message recovered from Chromium's per-page buffer after the fact.
 * Replayed args cannot be adopted as live JSHandles, so it only carries their
 * text representation plus the raw stack trace for symbolization.
 */
export class BufferedConsoleMessage {
  readonly argsCount: number;
  readonly rawStackTrace?: Protocol.Runtime.StackTrace;
  readonly targetId: string;
  #type: ConsoleMessageType;
  #text: string;

  constructor(params: {
    type: ConsoleMessageType;
    text: string;
    argsCount: number;
    rawStackTrace?: Protocol.Runtime.StackTrace;
    targetId: string;
  }) {
    this.#type = params.type;
    this.#text = params.text;
    this.argsCount = params.argsCount;
    this.rawStackTrace = params.rawStackTrace;
    this.targetId = params.targetId;
  }

  // Accessors mirror ConsoleMessage so shared code paths work on both.
  type(): ConsoleMessageType {
    return this.#type;
  }

  text(): string {
    return this.#text;
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
  #idGenerator = createIdGenerator();
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

    const listenerMap = listeners(value => {
      this.storage[0].push(this.#withStableId(value));
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

  #withStableId(value: T): WithSymbolId<T> {
    const withId = value as WithSymbolId<T>;
    withId[stableIdSymbol] = this.#idGenerator();
    return withId;
  }

  /**
   * Prepends items that were collected out-of-band and predate live
   * collection. The bucket is the navigation bucket the items belong to,
   * which may no longer be the current one if the page navigated in the
   * meantime.
   */
  protected prepend(items: T[], bucket: Array<WithSymbolId<T>>): void {
    bucket.unshift(...items.map(item => this.#withStableId(item)));
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
  | ConsoleMessage
  | BufferedConsoleMessage
  | Error
  | DevTools.AggregatedIssue
  | UncaughtError
> {
  #subscriber?: PageEventSubscriber;
  #backfill: Promise<void>;

  constructor(
    page: Page,
    listeners: (
      collector: (
        item:
          | ConsoleMessage
          | BufferedConsoleMessage
          | Error
          | DevTools.AggregatedIssue
          | UncaughtError,
      ) => void,
    ) => ListenerMap<PageEvents>,
  ) {
    super(page, listeners);
    this.#subscriber = new PageEventSubscriber(this.pptrPage);
    this.#subscriber.subscribe();
    this.#backfill = this.#backfillBufferedMessages();
  }

  /**
   * Resolves once messages buffered before this collector attached have been
   * recovered.
   */
  get backfilled(): Promise<void> {
    return this.#backfill;
  }

  /**
   * Chromium buffers console messages, uncaught exceptions, and log entries
   * per page and replays them to every new CDP session that enables the
   * respective domain. Puppeteer consumes that replay internally while
   * connecting, before any `console` listener can subscribe, so anything
   * logged before this collector attached would otherwise be missing.
   * Recover it through a throwaway CDP session. Events stamped after the
   * attach time are dropped because the live listeners already collect them.
   */
  async #backfillBufferedMessages(): Promise<void> {
    // Called from the constructor and runs synchronously up to the first
    // await, so both capture the attach-time state.
    const attachedAt = Date.now();
    const bucket = this.storage[0];
    try {
      const session = await this.pptrPage.createCDPSession();
      try {
        const {targetInfo} = await session.send('Target.getTargetInfo');
        const targetId = targetInfo.targetId;
        const buffered: Array<{
          timestamp: number;
          item: BufferedConsoleMessage | UncaughtError;
        }> = [];
        session.on('Runtime.consoleAPICalled', event => {
          if (event.timestamp <= attachedAt) {
            buffered.push({
              timestamp: event.timestamp,
              item: createBufferedConsoleMessage(event, targetId),
            });
          }
        });
        session.on('Runtime.exceptionThrown', event => {
          if (event.timestamp <= attachedAt) {
            buffered.push({
              timestamp: event.timestamp,
              item: new UncaughtError(event.exceptionDetails, targetId),
            });
          }
        });
        session.on('Log.entryAdded', event => {
          const entry = event.entry;
          // Puppeteer skips worker log entries in its live conversion.
          if (entry.timestamp <= attachedAt && entry.source !== 'worker') {
            buffered.push({
              timestamp: entry.timestamp,
              item: createBufferedLogMessage(entry, targetId),
            });
          }
        });
        // Buffered events are replayed before the respective call resolves.
        await session.send('Runtime.enable');
        await session.send('Log.enable');
        if (buffered.length > 0) {
          // Merge the replays of both domains chronologically.
          this.prepend(
            buffered
              .sort((a, b) => a.timestamp - b.timestamp)
              .map(entry => entry.item),
            bucket,
          );
        }
      } finally {
        // Detaching also releases the remote objects held by replayed args.
        await session.detach();
      }
    } catch (error) {
      logger?.('Error backfilling buffered console messages', error);
    }
  }

  override dispose(): void {
    super.dispose();
    this.#subscriber?.unsubscribe();
  }
}

/**
 * Creates a BufferedConsoleMessage from a replayed `Runtime.consoleAPICalled`
 * event, converting the type and args text the same way Puppeteer converts
 * live events.
 */
function createBufferedConsoleMessage(
  event: Protocol.Runtime.ConsoleAPICalledEvent,
  targetId: string,
): BufferedConsoleMessage {
  return new BufferedConsoleMessage({
    type: event.type === 'warning' ? 'warn' : event.type,
    text: event.args
      .map(remoteObject => textFromRemoteObject(remoteObject))
      .join(' '),
    argsCount: event.args.length,
    rawStackTrace: event.stackTrace,
    targetId,
  });
}

/**
 * Creates a BufferedConsoleMessage from a replayed `Log.entryAdded` event,
 * mirroring Puppeteer's own conversion.
 */
function createBufferedLogMessage(
  entry: Protocol.Log.LogEntry,
  targetId: string,
): BufferedConsoleMessage {
  return new BufferedConsoleMessage({
    type: entry.level === 'warning' ? 'warn' : entry.level,
    text: entry.text,
    argsCount: 0,
    rawStackTrace: entry.stackTrace,
    targetId,
  });
}

/**
 * Mirrors Puppeteer's `valueFromJSHandle` for args that are only available
 * as protocol RemoteObjects.
 */
function textFromRemoteObject(
  remoteObject: Protocol.Runtime.RemoteObject,
): string {
  if (remoteObject.objectId) {
    const description = remoteObject.description ?? '';
    if (remoteObject.subtype === 'error' && description) {
      return description.split('\n')[0];
    }
    return `[${remoteObject.subtype || remoteObject.type} ${remoteObject.className}]`;
  }
  if (remoteObject.unserializableValue) {
    return remoteObject.type === 'bigint'
      ? remoteObject.unserializableValue.replace('n', '')
      : remoteObject.unserializableValue;
  }
  return String(remoteObject.value);
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
