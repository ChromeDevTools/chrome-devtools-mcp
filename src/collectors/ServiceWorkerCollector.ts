/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {UncaughtError} from './PageCollector.js';
import type {
  ConsoleMessage,
  WebWorker,
  Target,
  Browser,
  HTTPRequest,
  RemoteException,
} from '../third_party/browser.js';
import type {McpWorker} from '../McpWorker.js';
import {
  createIdGenerator,
  stableIdSymbol,
  type WithSymbolId,
} from '../utils/id.js';
import {logger} from '../utils/logger.js';

const CHROME_EXTENSION_PREFIX = 'chrome-extension://';

interface ServiceWorkerSubscriberCallbacks {
  onConsole: (item: ConsoleMessage | UncaughtError) => void;
  onRequest: (request: HTTPRequest) => void;
}

/**
 * Subscribes to one service worker target. All listeners are attached to the
 * same {@link WebWorker} in one synchronous block, so no event is emitted
 * before every listener exists and the target is attached only once.
 */
export class ServiceWorkerSubscriber {
  #target: Target;
  #extensionId: string;
  #callbacks: ServiceWorkerSubscriberCallbacks;
  #worker?: WebWorker;

  constructor(
    target: Target,
    extensionId: string,
    callbacks: ServiceWorkerSubscriberCallbacks,
  ) {
    this.#target = target;
    this.#extensionId = extensionId;
    this.#callbacks = callbacks;
  }

  async subscribe(): Promise<void> {
    this.#worker = (await this.#target.worker()) ?? undefined;
    if (this.#worker) {
      this.#worker.on('console', this.#onConsole);
      this.#worker.on('exception', this.#onException);
      this.#worker.on('request', this.#onRequest);
    }
  }

  unsubscribe(): void {
    if (this.#worker) {
      this.#worker.off('console', this.#onConsole);
      this.#worker.off('exception', this.#onException);
      this.#worker.off('request', this.#onRequest);
    }
  }

  #onConsole = (message: ConsoleMessage): void => {
    this.#callbacks.onConsole(message);
  };

  #onException = (exception: RemoteException): void => {
    if (!this.#worker) {
      return;
    }
    const error = UncaughtError.fromException(
      exception,
      this.#extensionId,
      this.#worker.client,
    );
    if (error) {
      this.#callbacks.onConsole(error);
    }
  };

  #onRequest = (request: HTTPRequest): void => {
    this.#callbacks.onRequest(request);
  };
}

/**
 * Stores items per extension id with stable ids, keeping at most `maxItems`
 * per extension.
 */
export class ExtensionItemStore<T extends object> {
  #storage = new Map<string, Array<WithSymbolId<T>>>();
  #maxItems: number;
  #idGenerator = createIdGenerator();

  constructor(maxItems: number) {
    this.#maxItems = maxItems;
  }

  addLog(extensionId: string, log: T): void {
    const logs = this.#storage.get(extensionId) ?? [];
    const withId: WithSymbolId<T> = Object.assign(log, {
      [stableIdSymbol]: this.#idGenerator(),
    });
    logs.push(withId);
    if (logs.length > this.#maxItems) {
      logs.shift();
    }
    this.#storage.set(extensionId, logs);
  }

  getData(extensionId: string): Array<WithSymbolId<T>> {
    return this.#storage.get(extensionId) ?? [];
  }

  getById(extensionId: string, stableId: number): WithSymbolId<T> {
    const logs = this.#storage.get(extensionId);
    if (!logs) {
      throw new Error(`No items found for extension ${extensionId}.`);
    }
    const item = logs.find(item => item[stableIdSymbol] === stableId);
    if (item) {
      return item;
    }
    throw new Error(`Item ${stableId} not found for extension ${extensionId}.`);
  }

  find(
    extensionId: string,
    filter: (item: WithSymbolId<T>) => boolean,
  ): WithSymbolId<T> | undefined {
    const logs = this.#storage.get(extensionId);
    if (!logs) {
      return undefined;
    }
    return logs.find(filter);
  }

  clearLogs(extensionId: string): void {
    this.#storage.delete(extensionId);
  }
}

/**
 * Tracks extension service worker targets across the browser and stores their
 * console messages and network requests, keyed by extension id so data
 * survives service worker restarts.
 */
export class ServiceWorkerCollector {
  readonly console: ExtensionItemStore<ConsoleMessage | UncaughtError>;
  readonly network: ExtensionItemStore<HTTPRequest>;
  #browser?: Browser;
  #serviceWorkerSubscribers = new Map<Target, ServiceWorkerSubscriber>();

  constructor(browser?: Browser, maxItems = 1000) {
    this.#browser = browser;
    this.console = new ExtensionItemStore(maxItems);
    this.network = new ExtensionItemStore(maxItems);
  }

  async init(workers: McpWorker[]): Promise<void> {
    if (!this.#browser) {
      return;
    }
    this.#browser.on('targetcreated', this.#onTargetCreated);
    this.#browser.on('targetdestroyed', this.#onTargetDestroyed);

    for (const worker of workers) {
      void this.#onTargetCreated(worker.target);
    }
  }

  dispose(): void {
    if (!this.#browser) {
      return;
    }
    this.#browser.off('targetcreated', this.#onTargetCreated);
    this.#browser.off('targetdestroyed', this.#onTargetDestroyed);
    for (const subscriber of this.#serviceWorkerSubscribers.values()) {
      subscriber.unsubscribe();
    }
    this.#serviceWorkerSubscribers.clear();
  }

  #onTargetCreated = async (target: Target): Promise<void> => {
    if (this.#serviceWorkerSubscribers.has(target)) {
      return;
    }
    const origin = target.url();
    if (target.type() === 'service_worker' && isExtensionOrigin(origin)) {
      const extensionId = extractExtensionId(origin);

      if (!extensionId) {
        return;
      }

      const subscriber = new ServiceWorkerSubscriber(target, extensionId, {
        onConsole: item => this.console.addLog(extensionId, item),
        onRequest: request => this.network.addLog(extensionId, request),
      });
      this.#serviceWorkerSubscribers.set(target, subscriber);
      try {
        await subscriber.subscribe();
        if (this.#serviceWorkerSubscribers.get(target) !== subscriber) {
          subscriber.unsubscribe();
        }
      } catch (err) {
        if (this.#serviceWorkerSubscribers.get(target) === subscriber) {
          this.#serviceWorkerSubscribers.delete(target);
        }
        if (!isIgnoredTargetError(err)) {
          logger?.(
            `Failed to subscribe to service worker of extension ${extensionId} (${origin})`,
            err,
          );
        }
      }
    }
  };

  #onTargetDestroyed = (target: Target): void => {
    const subscriber = this.#serviceWorkerSubscribers.get(target);
    if (subscriber) {
      this.#serviceWorkerSubscribers.delete(target);
      subscriber.unsubscribe();
    }
  };
}

function extractExtensionId(origin: string): string | null {
  if (!origin || !isExtensionOrigin(origin)) {
    return null;
  }

  const pathPart = origin.substring(CHROME_EXTENSION_PREFIX.length);
  const slashIndex = pathPart.indexOf('/');

  // if there's no / it means that pathPart is now the extensionId, otherwise
  // we take everything until the first /
  return slashIndex === -1 ? pathPart : pathPart.substring(0, slashIndex);
}

function isExtensionOrigin(origin: string): boolean {
  return origin.startsWith(CHROME_EXTENSION_PREFIX);
}

function isIgnoredTargetError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes('Target closed') ||
      err.message.includes('Session closed') ||
      err.message.includes('No target with given id found') ||
      err.message.includes('No session with given id'))
  );
}
