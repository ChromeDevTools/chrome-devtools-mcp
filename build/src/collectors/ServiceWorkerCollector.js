/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UncaughtError } from './PageCollector.js';
import { createIdGenerator, stableIdSymbol } from '../utils/id.js';
const CHROME_EXTENSION_PREFIX = 'chrome-extension://';
export class ServiceWorkerSubscriber {
    #target;
    #callback;
    #session;
    #worker;
    constructor(target, callback) {
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
        await this.#session?.detach();
    }
    #onConsole = (message) => {
        this.#callback(message);
    };
    #onExceptionThrown = (event) => {
        const url = this.#target.url();
        const extensionId = extractExtensionId(url);
        if (extensionId) {
            this.#callback(new UncaughtError(event.exceptionDetails, extensionId));
        }
    };
}
export class ServiceWorkerConsoleCollector {
    #storage = new Map();
    #maxLogs;
    #browser;
    #serviceWorkerSubscribers = new Map();
    #idGenerator = createIdGenerator();
    constructor(browser, maxLogs = 1000) {
        this.#browser = browser;
        this.#maxLogs = maxLogs;
    }
    async init(workers) {
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
            subscriber.unsubscribe().catch(err => {
                if (!isIgnoredTargetError(err)) {
                    // Swallow error as we are tearing down the system
                }
            });
        }
        this.#serviceWorkerSubscribers.clear();
    }
    #onTargetCreated = async (target) => {
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
                    await subscriber.unsubscribe();
                }
            }
            catch (err) {
                if (this.#serviceWorkerSubscribers.get(target) === subscriber) {
                    this.#serviceWorkerSubscribers.delete(target);
                }
                if (!isIgnoredTargetError(err)) {
                    throw err;
                }
            }
        }
    };
    #onTargetDestroyed = async (target) => {
        const subscriber = this.#serviceWorkerSubscribers.get(target);
        if (subscriber) {
            this.#serviceWorkerSubscribers.delete(target);
            try {
                await subscriber.unsubscribe();
            }
            catch (err) {
                if (!isIgnoredTargetError(err)) {
                    throw err;
                }
            }
        }
    };
    addLog(extensionId, log) {
        const logs = this.#storage.get(extensionId) ?? [];
        const withId = log;
        withId[stableIdSymbol] = this.#idGenerator();
        logs.push(withId);
        if (logs.length > this.#maxLogs) {
            logs.shift();
        }
        this.#storage.set(extensionId, logs);
    }
    getData(extensionId) {
        return this.#storage.get(extensionId) ?? [];
    }
    getById(extensionId, stableId) {
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
    find(extensionId, filter) {
        const logs = this.#storage.get(extensionId);
        if (!logs) {
            return;
        }
        return logs.find(filter);
    }
    clearLogs(extensionId) {
        this.#storage.delete(extensionId);
    }
}
function extractExtensionId(origin) {
    if (!origin || !isExtensionOrigin(origin)) {
        return null;
    }
    const pathPart = origin.substring(CHROME_EXTENSION_PREFIX.length);
    const slashIndex = pathPart.indexOf('/');
    // if there's no / it means that pathPart is now the extensionId, otherwise
    // we take everything until the first /
    return slashIndex === -1 ? pathPart : pathPart.substring(0, slashIndex);
}
function isExtensionOrigin(origin) {
    return origin.startsWith(CHROME_EXTENSION_PREFIX);
}
function isIgnoredTargetError(err) {
    return (err instanceof Error &&
        (err.message.includes('Target closed') ||
            err.message.includes('Session closed') ||
            err.message.includes('No target with given id found') ||
            err.message.includes('No session with given id')));
}
//# sourceMappingURL=ServiceWorkerCollector.js.map