import { type Attribute, Cookie } from './Cookie.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class CookieModel extends SDKModel<EventTypes> {
    #private;
    constructor(target: Target);
    addBlockedCookie(cookie: Cookie, blockedReasons: BlockedReason[] | null): void;
    removeBlockedCookie(cookie: Cookie): void;
    getCookieToBlockedReasonsMap(): ReadonlyMap<Cookie, BlockedReason[]>;
    deleteCookie(cookie: Cookie): Promise<void>;
    clear(domain?: string, securityOrigin?: string): Promise<void>;
    saveCookie(cookie: Cookie): Promise<boolean>;
    /**
     * Returns cookies needed by current page's frames whose security origins are |domain|.
     */
    getCookiesForDomain(domain: string, forceUpdate?: boolean): Promise<Cookie[]>;
    deleteCookies(cookies: Cookie[]): Promise<void>;
}
export interface BlockedReason {
    uiString: string;
    attribute: Attribute | null;
}
export interface ExemptionReason {
    uiString: string;
}
export declare const enum Events {
    COOKIE_LIST_UPDATED = "CookieListUpdated"
}
export interface EventTypes {
    [Events.COOKIE_LIST_UPDATED]: void;
}
