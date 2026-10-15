/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { FakeIssuesManager } from '../devtools/DevtoolsUtils.js';
import { DevTools, FrameEvent } from '../third_party/index.js';
import { createIdGenerator, stableIdSymbol, } from '../utils/id.js';
import { logger } from '../utils/logger.js';
export class UncaughtError {
    details;
    targetId;
    constructor(details, targetId) {
        this.details = details;
        this.targetId = targetId;
    }
}
export class PageCollector {
    pptrPage;
    #listeners;
    #pendingSameDocumentNavigation = false;
    #frameNavigatedWithinDocumentTarget;
    maxNavigationSaved = 3;
    /**
     * This maps a Page to a list of navigations with a sub-list
     * of all collected resources.
     * The newer navigations come first.
     */
    storage = [[]];
    constructor(page, listeners, maxResourcesPerNavigation) {
        this.pptrPage = page;
        this.#attachFrameNavigatedWithinDocumentListener();
        const idGenerator = createIdGenerator();
        const listenerMap = listeners(value => {
            const withId = value;
            withId[stableIdSymbol] = idGenerator();
            this.storage[0].push(withId);
            if (maxResourcesPerNavigation !== undefined &&
                this.storage[0].length > maxResourcesPerNavigation) {
                this.storage[0].splice(0, this.storage[0].length - maxResourcesPerNavigation);
            }
        });
        listenerMap['framenavigated'] = (frame) => {
            // Only split the storage on main frame navigation
            if (frame !== this.pptrPage.mainFrame()) {
                return;
            }
            // Re-attach the listener to the current main frame: a cross-document
            // navigation may have replaced the frame object, so the reference
            // captured at construction time would be stale.
            this.#attachFrameNavigatedWithinDocumentListener();
            // Same-document (SPA) navigations also emit `framenavigated`, but they
            // must not rotate the retained history. Puppeteer emits
            // `FrameNavigatedWithinDocument` right before `FrameNavigated` for such
            // navigations, so consume the flag here to skip the split.
            if (this.#pendingSameDocumentNavigation) {
                this.#pendingSameDocumentNavigation = false;
                return;
            }
            this.splitAfterNavigation();
        };
        for (const [name, listener] of Object.entries(listenerMap)) {
            this.pptrPage.on(name, listener);
        }
        this.#listeners = listenerMap;
    }
    dispose() {
        this.#detachFrameNavigatedWithinDocumentListener();
        if (this.#listeners) {
            for (const [name, listener] of Object.entries(this.#listeners)) {
                this.pptrPage.off(name, listener);
            }
        }
    }
    // Puppeteer emits this right before the page-level navigation event for
    // same-document (SPA) navigations, which lets `framenavigated` skip the
    // history rotation for those navigations.
    #onFrameNavigatedWithinDocument = () => {
        this.#pendingSameDocumentNavigation = true;
    };
    #attachFrameNavigatedWithinDocumentListener() {
        this.#detachFrameNavigatedWithinDocumentListener();
        this.#frameNavigatedWithinDocumentTarget = this.pptrPage.mainFrame();
        this.#frameNavigatedWithinDocumentTarget.on(FrameEvent.FrameNavigatedWithinDocument, this.#onFrameNavigatedWithinDocument);
    }
    #detachFrameNavigatedWithinDocumentListener() {
        if (this.#frameNavigatedWithinDocumentTarget) {
            this.#frameNavigatedWithinDocumentTarget.off(FrameEvent.FrameNavigatedWithinDocument, this.#onFrameNavigatedWithinDocument);
            this.#frameNavigatedWithinDocumentTarget = undefined;
        }
    }
    splitAfterNavigation() {
        // Add the latest navigation first
        this.storage.unshift([]);
        this.storage.splice(this.maxNavigationSaved);
    }
    getData(includePreservedData) {
        if (!includePreservedData) {
            return this.storage[0];
        }
        const data = [];
        for (let index = this.maxNavigationSaved; index >= 0; index--) {
            if (this.storage[index]) {
                data.push(...this.storage[index]);
            }
        }
        return data;
    }
    getIdForResource(resource) {
        return resource[stableIdSymbol] ?? -1;
    }
    getById(stableId) {
        const item = this.find(item => item[stableIdSymbol] === stableId);
        if (!item) {
            throw new Error('Request not found for selected page');
        }
        return item;
    }
    find(filter) {
        for (const navigation of this.storage) {
            const item = navigation.find(filter);
            if (item) {
                return item;
            }
        }
        return;
    }
}
export class ConsoleCollector extends PageCollector {
    static MAX_MESSAGES_PER_NAVIGATION = 10_000;
    #subscriber;
    constructor(page, listeners, maxMessagesPerNavigation = ConsoleCollector.MAX_MESSAGES_PER_NAVIGATION) {
        super(page, listeners, maxMessagesPerNavigation);
        this.#subscriber = new PageEventSubscriber(this.pptrPage);
        this.#subscriber.subscribe();
    }
    dispose() {
        super.dispose();
        this.#subscriber?.unsubscribe();
    }
}
class PageEventSubscriber {
    #issueManager = new FakeIssuesManager();
    #issueAggregator = new DevTools.IssueAggregator(this.#issueManager);
    #seenKeys = new Set();
    #seenIssues = new Set();
    #page;
    #session;
    #targetId;
    #pendingSameDocumentNavigation = false;
    #frameNavigatedWithinDocumentTarget;
    constructor(page) {
        this.#page = page;
        // @ts-expect-error use existing CDP client (internal Puppeteer API).
        this.#session = this.#page._client();
        // @ts-expect-error use internal Puppeteer API to get target ID
        this.#targetId = this.#session.target()._targetId;
    }
    #resetIssueAggregator() {
        this.#issueManager = new FakeIssuesManager();
        if (this.#issueAggregator) {
            this.#issueAggregator.removeEventListener("AggregatedIssueUpdated" /* DevTools.IssueAggregatorEvents.AGGREGATED_ISSUE_UPDATED */, this.#onAggregatedIssue);
        }
        this.#issueAggregator = new DevTools.IssueAggregator(this.#issueManager);
        this.#issueAggregator.addEventListener("AggregatedIssueUpdated" /* DevTools.IssueAggregatorEvents.AGGREGATED_ISSUE_UPDATED */, this.#onAggregatedIssue);
    }
    subscribe() {
        this.#resetIssueAggregator();
        this.#page.on('framenavigated', this.#onFrameNavigated);
        this.#page.on('issue', this.#onIssueAdded);
        this.#session.on('Runtime.exceptionThrown', this.#onExceptionThrown);
        this.#attachFrameNavigatedWithinDocumentListener();
    }
    unsubscribe() {
        this.#seenKeys.clear();
        this.#seenIssues.clear();
        this.#detachFrameNavigatedWithinDocumentListener();
        this.#page.off('framenavigated', this.#onFrameNavigated);
        this.#page.off('issue', this.#onIssueAdded);
        this.#session.off('Runtime.exceptionThrown', this.#onExceptionThrown);
        if (this.#issueAggregator) {
            this.#issueAggregator.removeEventListener("AggregatedIssueUpdated" /* DevTools.IssueAggregatorEvents.AGGREGATED_ISSUE_UPDATED */, this.#onAggregatedIssue);
        }
    }
    #onAggregatedIssue = (event) => {
        if (this.#seenIssues.has(event.data)) {
            return;
        }
        this.#seenIssues.add(event.data);
        this.#page.emit('devtoolsAggregatedIssue', event.data);
    };
    #onExceptionThrown = (event) => {
        this.#page.emit('uncaughtError', new UncaughtError(event.exceptionDetails, this.#targetId));
    };
    // On navigation, we reset issue aggregation.
    #onFrameNavigated = (frame) => {
        // Only split the storage on main frame navigation
        if (frame !== frame.page().mainFrame()) {
            return;
        }
        // Re-attach the listener to the current main frame: a cross-document
        // navigation may have replaced the frame object, so the reference
        // captured at construction time would be stale.
        this.#attachFrameNavigatedWithinDocumentListener();
        if (this.#pendingSameDocumentNavigation) {
            this.#pendingSameDocumentNavigation = false;
            return;
        }
        this.#seenKeys.clear();
        this.#seenIssues.clear();
        this.#resetIssueAggregator();
    };
    // Puppeteer emits this right before the page-level navigation event for
    // same-document (SPA) navigations, which lets `framenavigated` skip the
    // issue aggregation reset for those navigations.
    #onFrameNavigatedWithinDocument = () => {
        this.#pendingSameDocumentNavigation = true;
    };
    #attachFrameNavigatedWithinDocumentListener() {
        this.#detachFrameNavigatedWithinDocumentListener();
        this.#frameNavigatedWithinDocumentTarget = this.#page.mainFrame();
        this.#frameNavigatedWithinDocumentTarget.on(FrameEvent.FrameNavigatedWithinDocument, this.#onFrameNavigatedWithinDocument);
    }
    #detachFrameNavigatedWithinDocumentListener() {
        if (this.#frameNavigatedWithinDocumentTarget) {
            this.#frameNavigatedWithinDocumentTarget.off(FrameEvent.FrameNavigatedWithinDocument, this.#onFrameNavigatedWithinDocument);
            this.#frameNavigatedWithinDocumentTarget = undefined;
        }
    }
    #onIssueAdded = (inspectorIssue) => {
        try {
            // @ts-expect-error The types are missmatched but they
            // are coming from CDP
            if (!DevTools.isIssueCodeSupported(inspectorIssue.code)) {
                return;
            }
            const issue = DevTools.createIssuesFromProtocolIssue(null, 
            // @ts-expect-error Protocol types diverge.
            inspectorIssue)[0];
            if (!issue) {
                logger?.('No issue mapping for for the issue: ', inspectorIssue.code);
                return;
            }
            const primaryKey = issue.primaryKey();
            if (this.#seenKeys.has(primaryKey)) {
                return;
            }
            this.#seenKeys.add(primaryKey);
            this.#issueManager.dispatchEventToListeners("IssueAdded" /* DevTools.IssuesManagerEvents.ISSUE_ADDED */, {
                issue,
                // @ts-expect-error We don't care that issues model is null
                issuesModel: null,
            });
        }
        catch (error) {
            logger?.('Error creating a new issue', error);
        }
    };
}
export class NetworkCollector extends PageCollector {
    static MAX_REQUESTS_PER_NAVIGATION = 1_000;
    constructor(page, maxRequestsPerNavigation = NetworkCollector.MAX_REQUESTS_PER_NAVIGATION, listeners = collect => {
        return {
            request: req => {
                collect(req);
            },
        };
    }) {
        super(page, listeners, maxRequestsPerNavigation);
    }
    splitAfterNavigation() {
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
        }
        else {
            this.storage.unshift([]);
        }
        this.storage.splice(this.maxNavigationSaved);
    }
}
//# sourceMappingURL=PageCollector.js.map