import type * as Puppeteer from '../../third_party/puppeteer/puppeteer.js';
import * as CDPConnection from './CDPConnection.js';
/**
 * This class makes a puppeteer connection look like DevTools CDPConnection.
 *
 * Since we connect "root" DevTools targets to specific pages, we scope everything to a puppeteer CDP session.
 *
 * We don't have to recursively listen for 'sessionattached' as the "root" CDP session sees all child session attached
 * events, regardless how deeply nested they are.
 */
export declare class PuppeteerDevToolsConnection implements CDPConnection.CDPConnection {
    #private;
    constructor(session: Puppeteer.CDPSession);
    send<T extends CDPConnection.Command>(method: T, params: CDPConnection.CommandParams<T>, sessionId: string | undefined): Promise<{
        result: CDPConnection.CommandResult<T>;
    } | {
        error: CDPConnection.CDPError;
    }>;
    observe(observer: CDPConnection.CDPConnectionObserver): void;
    unobserve(observer: CDPConnection.CDPConnectionObserver): void;
    dispose(reason: string): void;
}
