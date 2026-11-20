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

export class ServiceWorkerSubscriber {
  #target: Target;
  #callback: (item: ConsoleMessage | UncaughtError) => void;
  #worker?: WebWorker;

  constructor(
    target: Target,
    callback: (item: ConsoleMessage | UncaughtError) => void,
  ) {
    this.#target = target;
    this.#callback = callback;
  }

  async subscribe(): Promise<void> {
    this.#worker = (await this.#target.worker()) ?? undefined;
    if (this.#worker) {
      this.#worker.on('console', this.#onConsole);
      this.#worker.on('exception', this.#onException);
    }
  }

  unsubscribe(): void {
    if (this.#worker) {
      this.#worker.off('console', this.#onConsole);
      this.#worker.off('exception', this.#onException);
    }
  }

  #onConsole = (message: ConsoleMessage): void => {
    this.#callback(message);
  };

  #onException = (exception: RemoteException): void => {
    const extensionId = extractExtensionId(this.#target.url());
    if (!extensionId || !this.#worker) {
      return;
    }
    const error = UncaughtError.fromException(
      exception,
      extensionId,
      this.#worker.client,
    );
    if (error) {
      this.#callback(error);
    }
  };
}

export class ServiceWorkerConsoleCollector {
  #storage = new Map<
    string,
    Array<WithSymbolId<ConsoleMessage | UncaughtError>>
  >();
  #maxLogs: number;
  #browser?: Browser;
  #serviceWorkerSubscribers = new Map<Target, ServiceWorkerSubscriber>();
  #idGenerator = createIdGenerator();

  constructor(browser?: Browser, maxLogs = 1000) {
    this.#browser = browser;
    this.#maxLogs = maxLogs;
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

      const subscriber = new ServiceWorkerSubscriber(target, item => {
        this.addLog(extensionId, item);
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

  addLog(extensionId: string, log: ConsoleMessage | UncaughtError): void {
    const logs = this.#storage.get(extensionId) ?? [];
    const withId = log as WithSymbolId<ConsoleMessage | UncaughtError>;
    withId[stableIdSymbol] = this.#idGenerator();
    logs.push(withId);
    if (logs.length > this.#maxLogs) {
      logs.shift();
    }
    this.#storage.set(extensionId, logs);
  }

  getData(
    extensionId: string,
  ): Array<WithSymbolId<ConsoleMessage | UncaughtError>> {
    return this.#storage.get(extensionId) ?? [];
  }

  getById(
    extensionId: string,
    stableId: number,
  ): WithSymbolId<ConsoleMessage | UncaughtError> {
    const logs = this.#storage.get(extensionId);
    if (!logs) {
      throw new Error(
        `No console messages found for extension ${extensionId}.`,
      );
    }
    const item = logs.find(item => item[stableIdSymbol] === stableId);
    if (item) {
      return item;
    }
    throw new Error(
      `Console message ${stableId} not found for extension ${extensionId}.`,
    );
  }

  find(
    extensionId: string,
    filter: (item: WithSymbolId<ConsoleMessage | UncaughtError>) => boolean,
  ): WithSymbolId<ConsoleMessage | UncaughtError> | undefined {
    const logs = this.#storage.get(extensionId);
    if (!logs) {
      return;
    }
    return logs.find(filter);
  }

  clearLogs(extensionId: string): void {
    this.#storage.delete(extensionId);
  }
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
