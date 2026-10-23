/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools, type CDPSession, type ConsoleMessage, type Protocol, type HTTPRequest, type Page, type PageEvents as PuppeteerPageEvents } from '../third_party/index.js';
import { type WithSymbolId } from '../utils/id.js';
export declare class UncaughtError {
    readonly details: Protocol.Runtime.ExceptionDetails;
    readonly targetId: string;
    readonly session?: CDPSession;
    constructor(details: Protocol.Runtime.ExceptionDetails, targetId: string, session?: CDPSession);
}
interface PageEvents extends PuppeteerPageEvents {
    devtoolsAggregatedIssue: DevTools.AggregatedIssue;
    uncaughtError: UncaughtError;
}
export type ListenerMap<EventMap extends PageEvents = PageEvents> = {
    [K in keyof EventMap as string extends K ? never : number extends K ? never : symbol extends K ? never : K]?: (event: EventMap[K]) => void;
};
export interface PageCollectorOptions {
    maxResourcesPerNavigation?: number;
    maxNavigationSaved?: number;
}
export declare class PageCollector<T> {
    #private;
    protected pptrPage: Page;
    protected readonly maxNavigationSaved: number;
    /**
     * This maps a Page to a list of navigations with a sub-list
     * of all collected resources.
     * The newer navigations come first.
     */
    protected storage: Array<Array<WithSymbolId<T>>>;
    constructor(page: Page, listeners: (collector: (item: T) => void) => ListenerMap<PageEvents>, { maxResourcesPerNavigation, maxNavigationSaved, }?: PageCollectorOptions);
    dispose(): void;
    protected splitAfterNavigation(): void;
    getData(includePreservedData?: boolean): T[];
    getIdForResource(resource: WithSymbolId<T>): number;
    getById(stableId: number): T;
    find(filter: (item: WithSymbolId<T>) => boolean): WithSymbolId<T> | undefined;
}
export declare class ConsoleCollector extends PageCollector<ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError> {
    #private;
    static readonly MAX_MESSAGES_PER_NAVIGATION = 10000;
    constructor(page: Page, listeners: (collector: (item: ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError) => void) => ListenerMap<PageEvents>, { maxResourcesPerNavigation, maxNavigationSaved, }?: PageCollectorOptions);
    dispose(): void;
}
export declare class NetworkCollector extends PageCollector<HTTPRequest> {
    static readonly MAX_REQUESTS_PER_NAVIGATION = 1000;
    constructor(page: Page, { maxResourcesPerNavigation, maxNavigationSaved, }?: PageCollectorOptions, listeners?: (collector: (item: HTTPRequest) => void) => ListenerMap<PageEvents>);
    splitAfterNavigation(): void;
}
export {};
