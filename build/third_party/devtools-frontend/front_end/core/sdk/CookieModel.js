// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { Cookie } from './Cookie.js';
import { Events as NetworkManagerEvents, NetworkManager } from './NetworkManager.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel } from './ResourceTreeModel.js';
import { SDKModel } from './SDKModel.js';
export class CookieModel extends SDKModel {
    #blockedCookies = new Map();
    #cookieToBlockedReasons = new Map();
    #refreshThrottler = new Common.Throttler.Throttler(300);
    #cookies = new Map();
    constructor(target) {
        super(target);
        target.model(ResourceTreeModel)
            ?.addEventListener(ResourceTreeModelEvents.PrimaryPageChanged, this.#onPrimaryPageChanged, this);
        target.model(NetworkManager)
            ?.addEventListener(NetworkManagerEvents.ResponseReceived, this.#onResponseReceived, this);
        target.model(NetworkManager)?.addEventListener(NetworkManagerEvents.LoadingFinished, this.#onLoadingFinished, this);
    }
    addBlockedCookie(cookie, blockedReasons) {
        const key = cookie.key();
        const previousCookie = this.#blockedCookies.get(key);
        this.#blockedCookies.set(key, cookie);
        if (blockedReasons) {
            this.#cookieToBlockedReasons.set(cookie, blockedReasons);
        }
        else {
            this.#cookieToBlockedReasons.delete(cookie);
        }
        if (previousCookie) {
            this.#cookieToBlockedReasons.delete(previousCookie);
        }
    }
    removeBlockedCookie(cookie) {
        this.#blockedCookies.delete(cookie.key());
    }
    async #onPrimaryPageChanged() {
        this.#blockedCookies.clear();
        this.#cookieToBlockedReasons.clear();
        await this.#refresh();
    }
    getCookieToBlockedReasonsMap() {
        return this.#cookieToBlockedReasons;
    }
    async #getCookies(urls) {
        const networkAgent = this.target().networkAgent();
        const newCookies = new Map(await Promise.all(urls.keysArray().map(domain => networkAgent.invoke_getCookies({ urls: [...urls.get(domain).values()] })
            .then(({ cookies }) => [domain, cookies.map(Cookie.fromProtocolCookie)]))));
        const updated = this.#isUpdated(newCookies);
        this.#cookies = newCookies;
        if (updated) {
            this.dispatchEventToListeners("CookieListUpdated" /* Events.COOKIE_LIST_UPDATED */);
        }
    }
    async deleteCookie(cookie) {
        await this.deleteCookies([cookie]);
    }
    async clear(domain, securityOrigin) {
        if (!this.#isRefreshing()) {
            await this.#refreshThrottled();
        }
        const cookies = domain ? (this.#cookies.get(domain) || []) : [...this.#cookies.values()].flat();
        cookies.push(...this.#blockedCookies.values());
        if (securityOrigin) {
            const cookiesToDelete = cookies.filter(cookie => {
                return cookie.matchesSecurityOrigin(securityOrigin);
            });
            await this.deleteCookies(cookiesToDelete);
        }
        else {
            await this.deleteCookies(cookies);
        }
    }
    async saveCookie(cookie) {
        let domain = cookie.domain();
        if (!domain.startsWith('.')) {
            domain = '';
        }
        let expires = undefined;
        if (cookie.expires()) {
            expires = Math.floor(Date.parse(`${cookie.expires()}`) / 1000);
        }
        const schemeBindingEnabled = Boolean(Root.Runtime.hostConfig.devToolsEnableOriginBoundCookies?.schemeBindingEnabled);
        const portBindingEnabled = Boolean(Root.Runtime.hostConfig.devToolsEnableOriginBoundCookies?.portBindingEnabled);
        const preserveUnset = (scheme) => scheme === "Unset" /* Protocol.Network.CookieSourceScheme.Unset */ ? scheme : undefined;
        const protocolCookie = {
            name: cookie.name(),
            value: cookie.value(),
            url: cookie.url() || undefined,
            domain,
            path: cookie.path(),
            secure: cookie.secure(),
            httpOnly: cookie.httpOnly(),
            sameSite: cookie.sameSite(),
            expires,
            priority: cookie.priority(),
            partitionKey: cookie.partitionKey(),
            sourceScheme: schemeBindingEnabled ? cookie.sourceScheme() : preserveUnset(cookie.sourceScheme()),
            sourcePort: portBindingEnabled ? cookie.sourcePort() : undefined,
        };
        const response = await this.target().networkAgent().invoke_setCookie(protocolCookie);
        const error = response.getError();
        if (error || !response.success) {
            return false;
        }
        await this.#refreshThrottled();
        return response.success;
    }
    /**
     * Returns cookies needed by current page's frames whose security origins are |domain|.
     */
    async getCookiesForDomain(domain, forceUpdate) {
        if (!this.#isRefreshing() || forceUpdate) {
            await this.#refreshThrottled();
        }
        const normalCookies = this.#cookies.get(domain) || [];
        return normalCookies.concat(Array.from(this.#blockedCookies.values()));
    }
    async deleteCookies(cookies) {
        const networkAgent = this.target().networkAgent();
        this.#blockedCookies.clear();
        this.#cookieToBlockedReasons.clear();
        await Promise.all(cookies.map(cookie => networkAgent.invoke_deleteCookies({
            name: cookie.name(),
            domain: cookie.domain(),
            path: cookie.path(),
            partitionKey: cookie.partitionKey(),
        })));
        await this.#refreshThrottled();
    }
    #isRefreshing() {
        return Boolean(this.listeners?.size);
    }
    #isUpdated(newCookies) {
        if (newCookies.size !== this.#cookies.size) {
            return true;
        }
        for (const [domain, newDomainCookies] of newCookies) {
            if (!this.#cookies.has(domain)) {
                return true;
            }
            const oldDomainCookies = this.#cookies.get(domain) || [];
            if (newDomainCookies.length !== oldDomainCookies.length) {
                return true;
            }
            const comparisonKey = (c) => c.key() + ' ' + c.value();
            const oldDomainCookieKeys = new Set(oldDomainCookies.map(comparisonKey));
            for (const newCookie of newDomainCookies) {
                if (!oldDomainCookieKeys.has(comparisonKey(newCookie))) {
                    return true;
                }
            }
        }
        return false;
    }
    #refreshThrottled() {
        return this.#refreshThrottler.schedule(() => this.#refresh());
    }
    #refresh() {
        const resourceURLs = new Platform.MapUtilities.Multimap();
        function populateResourceURLs(resource) {
            const documentURL = Common.ParsedURL.ParsedURL.fromString(resource.documentURL);
            if (documentURL) {
                resourceURLs.set(documentURL.securityOrigin(), resource.url);
            }
            return false;
        }
        const resourceTreeModel = this.target().model(ResourceTreeModel);
        if (resourceTreeModel) {
            // In case the current frame was unreachable, add its cookies
            // because they might help to debug why the frame was unreachable.
            const unreachableUrl = resourceTreeModel.mainFrame?.unreachableUrl();
            if (unreachableUrl) {
                const documentURL = Common.ParsedURL.ParsedURL.fromString(unreachableUrl);
                if (documentURL) {
                    resourceURLs.set(documentURL.securityOrigin(), unreachableUrl);
                }
            }
            resourceTreeModel.forAllResources(populateResourceURLs);
        }
        return this.#getCookies(resourceURLs);
    }
    #onResponseReceived() {
        if (this.#isRefreshing()) {
            void this.#refreshThrottled();
        }
    }
    #onLoadingFinished() {
        if (this.#isRefreshing()) {
            void this.#refreshThrottled();
        }
    }
}
SDKModel.register(CookieModel, { capabilities: 16 /* Capability.NETWORK */, autostart: false });
//# sourceMappingURL=CookieModel.js.map