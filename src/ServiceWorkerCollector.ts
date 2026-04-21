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
  CDPSession,
  Protocol,
  Browser,
} from './third_party/index.js';
import type {ExtensionServiceWorker} from './types.js';
import type {WithSymbolId} from './utils/id.js';
import {createIdGenerator, stableIdSymbol} from './utils/id.js';

const CHROME_EXTENSION_PREFIX = 'chrome-extension://';

export class ServiceWorkerSubscriber {
  #target: Target;
  #callback: (item: ConsoleMessage | UncaughtError) => void;
  #session?: CDPSession;
  #worker?: WebWorker;

  constructor(
    target: Target,
    callback: (item: ConsoleMessage | UncaughtError) => void,
  ) {
    this.#target = target;
    this.#callback = callback;
  }

  async subscribe() {
    this.#session = await this.#target.createCDPSession();
    await this.#session.send('Runtime.enable');
    this.#session.on('Runtime.exceptionThrown', this.#onExceptionThrown);

    this.#worker = (await this.#target.worker()) ?? undefined;
    if (this.#worker) {
      this.#worker.on('console', this.#onConsole);
    }
  }

  async unsubscribe() {
    if (this.#worker) {
      this.#worker.off('console', this.#onConsole);
    }
    if (this.#session) {
      this.#session.off('Runtime.exceptionThrown', this.#onExceptionThrown);
      await this.#session.send('Runtime.disable');
    }
  }

  #onConsole = (message: ConsoleMessage) => {
    this.#callback(message);
  };

  #onExceptionThrown = (event: Protocol.Runtime.ExceptionThrownEvent) => {
    const url = this.#target.url();

    const extensionId = extractExtensionId(url);

    if (extensionId) {
      this.#callback(new UncaughtError(event.exceptionDetails, extensionId));
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

  async init(workers: ExtensionServiceWorker[]) {
    if (!this.#browser) {
      return;
    }
    this.#browser.on('targetcreated', this.#onTargetCreated);
    this.#browser.on('targetdestroyed', this.#onTargetDestroyed);

    for (const worker of workers) {
      void this.#onTargetCreated(worker.target);
    }
  }

  dispose() {
    if (!this.#browser) {
      return;
    }
    this.#browser.off('targetcreated', this.#onTargetCreated);
    this.#browser.off('targetdestroyed', this.#onTargetDestroyed);
    for (const subscriber of this.#serviceWorkerSubscribers.values()) {
      void subscriber.unsubscribe();
    }
    this.#serviceWorkerSubscribers.clear();
  }

  #onTargetCreated = async (target: Target) => {
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
      void subscriber.subscribe();
      this.#serviceWorkerSubscribers.set(target, subscriber);
    }
  };

  #onTargetDestroyed = async (target: Target) => {
    const subscriber = this.#serviceWorkerSubscribers.get(target);
    if (subscriber) {
      void subscriber.unsubscribe();
      this.#serviceWorkerSubscribers.delete(target);
    }
  };

  addLog(extensionId: string, log: ConsoleMessage | UncaughtError) {
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
      throw new Error('No logs found for selected extension');
    }
    const item = logs.find(item => item[stableIdSymbol] === stableId);
    if (item) {
      return item;
    }
    throw new Error('Log not found for selected extension');
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

  clearLogs(extensionId: string) {
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

function isExtensionOrigin(origin: string) {
  return origin.startsWith(CHROME_EXTENSION_PREFIX);
}
