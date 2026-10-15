/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { logger } from './logger.js';
export class WaitForHelper {
    #abortController = new AbortController();
    #page;
    #publicPage;
    #stableDomTimeout;
    #stableDomFor;
    #expectNavigationIn;
    #navigationTimeout;
    #dialogHandled = false;
    /** Track all dialogs as they pause the renderer. */
    #dialogDetected = false;
    #initialUrl;
    #openedPages = new Set();
    constructor(page, cpuTimeoutMultiplier, networkTimeoutMultiplier) {
        this.#stableDomTimeout = 3000 * cpuTimeoutMultiplier;
        this.#stableDomFor = 100 * cpuTimeoutMultiplier;
        this.#expectNavigationIn = 100 * cpuTimeoutMultiplier;
        this.#navigationTimeout = 3000 * networkTimeoutMultiplier;
        this.#page = page;
        this.#publicPage = page;
        this.#initialUrl = page.url();
    }
    /**
     * A wrapper that executes a action and waits for
     * a potential navigation, after which it waits
     * for the DOM to be stable before returning.
     */
    async waitForStableDom() {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            // Bound the setup evaluation against the stable-DOM timeout. Without this
            // cap a paused renderer (e.g. an open dialog) would make evaluateHandle
            // hang until protocolTimeout (default 180s) while the tool mutex is held.
            const stableDomObserver = __addDisposableResource(env_1, await Promise.race([
                this.#page.evaluateHandle(timeout => {
                    let timeoutId;
                    function callback() {
                        clearTimeout(timeoutId);
                        timeoutId = setTimeout(() => {
                            domObserver.resolver.resolve();
                            domObserver.observer.disconnect();
                        }, timeout);
                    }
                    const domObserver = {
                        resolver: Promise.withResolvers(),
                        observer: new MutationObserver(callback),
                    };
                    // It's possible that the DOM is not gonna change so we
                    // need to start the timeout initially.
                    callback();
                    domObserver.observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                    });
                    return domObserver;
                }, this.#stableDomFor),
                this.timeout(this.#stableDomTimeout),
            ]).catch(() => undefined), false);
            if (!stableDomObserver) {
                return;
            }
            this.#abortController.signal.addEventListener('abort', async () => {
                try {
                    await stableDomObserver.evaluate(observer => {
                        observer.observer.disconnect();
                        observer.resolver.resolve();
                    });
                }
                catch {
                    // Ignored cleanup errors
                }
            });
            return await Promise.race([
                stableDomObserver.evaluate(async (observer) => {
                    return await observer.resolver.promise;
                }),
                this.timeout(this.#stableDomTimeout).then(() => {
                    throw new Error('Timeout');
                }),
            ]);
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    timeout(time) {
        if (this.#abortController.signal.aborted) {
            return Promise.resolve();
        }
        return new Promise(res => {
            const id = setTimeout(res, time);
            this.#abortController.signal.addEventListener('abort', () => {
                res();
                clearTimeout(id);
            });
        });
    }
    async waitForEventsAfterAction(action, options) {
        if (this.#abortController.signal.aborted) {
            throw new Error("Can't re-use a WaitForHelper");
        }
        const dialogHandler = (dialog) => {
            this.#dialogDetected = true;
            let actionToTake;
            if (typeof options?.handleDialog === 'object') {
                actionToTake = options.handleDialog[dialog.type()];
            }
            else {
                actionToTake = options?.handleDialog;
            }
            if (actionToTake) {
                this.#dialogHandled = true;
                if (actionToTake === 'dismiss') {
                    void dialog.dismiss();
                }
                else if (actionToTake === 'accept') {
                    void dialog.accept();
                }
                else {
                    void dialog.accept(actionToTake);
                }
            }
            else {
                this.#abortController.abort(new Error('Action interrupted by a dialog'));
            }
        };
        this.#page.on('dialog', dialogHandler);
        this.#abortController.signal.addEventListener('abort', () => {
            this.#page.off('dialog', dialogHandler);
        });
        const popupHandler = (page) => {
            if (page) {
                this.#openedPages.add(page.target());
            }
        };
        this.#publicPage.on('popup', popupHandler);
        this.#abortController.signal.addEventListener('abort', () => {
            this.#publicPage.off('popup', popupHandler);
        });
        // A scoped AbortController used to clean up navigation probe listeners.
        // When aborted (either after navigation detection finishes or if this.#abortController
        // aborts), it removes CDP navigation probe listeners and automatically
        // detaches the abort listener from this.#abortController.signal.
        const navigationAbortController = new AbortController();
        const navigationStartedResolvers = Promise.withResolvers();
        const navigationListener = (event) => {
            if (event.frameId !== this.#page.mainFrame()._id) {
                return;
            }
            if (event.navigationType === 'sameDocument' ||
                event.navigationType === 'historySameDocument') {
                return;
            }
            navigationStartedResolvers.resolve(true);
        };
        const requestedNavigationListener = (event) => {
            if (event.frameId === this.#page.mainFrame()._id) {
                navigationStartedResolvers.resolve(true);
            }
        };
        this.#page._client().on('Page.frameStartedNavigating', navigationListener);
        this.#page
            ._client()
            .on('Page.frameRequestedNavigation', requestedNavigationListener);
        navigationAbortController.signal.addEventListener('abort', () => {
            this.#page
                ._client()
                .off('Page.frameStartedNavigating', navigationListener);
            this.#page
                ._client()
                .off('Page.frameRequestedNavigation', requestedNavigationListener);
        });
        this.#abortController.signal.addEventListener('abort', () => {
            navigationStartedResolvers.resolve(false);
            navigationAbortController.abort();
        }, { signal: navigationAbortController.signal });
        // Puppeteer's waitForNavigation must be started before the action runs so that
        // it captures the pre-action loader ID. If started after the action triggers navigation,
        // it risks recording the new loader ID and hanging until timeout.
        // If no navigation occurs, this.#abortController will cancel it in the finally block.
        const navigationFinished = this.#page
            .waitForNavigation({
            timeout: 0,
            signal: this.#abortController.signal,
            ignoreSameDocumentNavigation: true,
        })
            .then(result => {
            navigationStartedResolvers.resolve(true);
            return result;
        })
            .catch(error => {
            if (this.#abortController.signal.aborted ||
                (error instanceof Error && error.name === 'AbortError')) {
                return;
            }
            logger?.(error);
        });
        try {
            await action(this.#abortController.signal);
        }
        catch (error) {
            // Clear up pending promises
            this.#abortController.abort();
            throw error;
        }
        const expectNavigationIn = options?.expectNavigationIn ?? this.#expectNavigationIn;
        const navigationStarted = await Promise.race([
            navigationStartedResolvers.promise,
            this.timeout(expectNavigationIn).then(() => {
                navigationStartedResolvers.resolve(false);
                return false;
            }),
        ]);
        navigationAbortController.abort();
        try {
            // Only await navigation if one was actually initiated; otherwise, the
            // pending waitForNavigation promise will be cancelled when this.#abortController aborts.
            if (navigationStarted) {
                await Promise.race([
                    navigationFinished,
                    this.timeout(options?.timeout ?? this.#navigationTimeout),
                ]);
            }
            if (this.#dialogDetected) {
                return this.#getResult();
            }
            // Wait for stable dom after navigation so we execute in
            // the correct context
            if (options?.waitForStableDom !== false) {
                await this.waitForStableDom();
            }
        }
        catch (error) {
            logger?.(error);
        }
        finally {
            this.#abortController.abort();
        }
        return this.#getResult();
    }
    #getResult() {
        const urlAfterAction = this.#page.url();
        return {
            ...(urlAfterAction !== this.#initialUrl
                ? { navigatedToUrl: urlAfterAction }
                : {}),
            dialogHandled: this.#dialogHandled,
            ...(this.#openedPages.size ? { openedPages: this.#openedPages } : {}),
        };
    }
}
export function getNetworkMultiplierFromString(condition) {
    const puppeteerCondition = condition;
    switch (puppeteerCondition) {
        case 'Fast 4G':
            return 1;
        case 'Slow 4G':
            return 2.5;
        case 'Fast 3G':
            return 5;
        case 'Slow 3G':
            return 10;
    }
    return 1;
}
//# sourceMappingURL=WaitForHelper.js.map