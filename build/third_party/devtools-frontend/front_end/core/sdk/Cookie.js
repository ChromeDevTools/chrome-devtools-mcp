// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const OPAQUE_PARTITION_KEY = '<opaque>';
export class Cookie {
    #name;
    #value;
    #type;
    #attributes = new Map();
    #size = 0;
    #priority;
    #cookieLine = null;
    #partitionKey;
    constructor(name, value, type, priority, partitionKey) {
        this.#name = name;
        this.#value = value;
        this.#type = type;
        this.#priority = (priority || 'Medium');
        this.#partitionKey = partitionKey;
    }
    static fromProtocolCookie(protocolCookie) {
        const cookie = new Cookie(protocolCookie.name, protocolCookie.value, null, protocolCookie.priority);
        cookie.addAttribute("domain" /* Attribute.DOMAIN */, protocolCookie['domain']);
        cookie.addAttribute("path" /* Attribute.PATH */, protocolCookie['path']);
        if (protocolCookie['expires']) {
            cookie.addAttribute("expires" /* Attribute.EXPIRES */, protocolCookie['expires'] * 1000);
        }
        if (protocolCookie['httpOnly']) {
            cookie.addAttribute("http-only" /* Attribute.HTTP_ONLY */);
        }
        if (protocolCookie['secure']) {
            cookie.addAttribute("secure" /* Attribute.SECURE */);
        }
        if (protocolCookie['sameSite']) {
            cookie.addAttribute("same-site" /* Attribute.SAME_SITE */, protocolCookie['sameSite']);
        }
        if ('sourcePort' in protocolCookie) {
            cookie.addAttribute("source-port" /* Attribute.SOURCE_PORT */, protocolCookie.sourcePort);
        }
        if ('sourceScheme' in protocolCookie) {
            cookie.addAttribute("source-scheme" /* Attribute.SOURCE_SCHEME */, protocolCookie.sourceScheme);
        }
        if ('partitionKey' in protocolCookie) {
            if (protocolCookie.partitionKey) {
                cookie.setPartitionKey(protocolCookie.partitionKey.topLevelSite, protocolCookie.partitionKey.hasCrossSiteAncestor);
            }
        }
        if ('partitionKeyOpaque' in protocolCookie && protocolCookie.partitionKeyOpaque) {
            cookie.addAttribute("partition-key" /* Attribute.PARTITION_KEY */, OPAQUE_PARTITION_KEY);
        }
        cookie.setSize(protocolCookie['size']);
        return cookie;
    }
    key() {
        return (this.domain() || '-') + ' ' + this.name() + ' ' + (this.path() || '-') + ' ' +
            (this.partitionKey() ?
                (this.topLevelSite() + ' ' + (this.hasCrossSiteAncestor() ? 'cross_site' : 'same_site')) :
                '-');
    }
    name() {
        return this.#name;
    }
    value() {
        return this.#value;
    }
    type() {
        return this.#type;
    }
    httpOnly() {
        return this.#attributes.has("http-only" /* Attribute.HTTP_ONLY */);
    }
    secure() {
        return this.#attributes.has("secure" /* Attribute.SECURE */);
    }
    partitioned() {
        return this.#attributes.has("partitioned" /* Attribute.PARTITIONED */) || Boolean(this.partitionKey()) || this.partitionKeyOpaque();
    }
    sameSite() {
        // TODO(allada) This should not rely on #attributes and instead store them individually.
        // when #attributes get added via addAttribute() they are lowercased, hence the lowercasing of samesite here
        return this.#attributes.get("same-site" /* Attribute.SAME_SITE */);
    }
    partitionKey() {
        return this.#partitionKey;
    }
    setPartitionKey(topLevelSite, hasCrossSiteAncestor) {
        this.#partitionKey = { topLevelSite, hasCrossSiteAncestor };
        if (!this.#attributes.has("partitioned" /* Attribute.PARTITIONED */)) {
            this.addAttribute("partitioned" /* Attribute.PARTITIONED */);
        }
    }
    topLevelSite() {
        if (!this.#partitionKey) {
            return '';
        }
        return this.#partitionKey?.topLevelSite;
    }
    setTopLevelSite(topLevelSite, hasCrossSiteAncestor) {
        this.setPartitionKey(topLevelSite, hasCrossSiteAncestor);
    }
    hasCrossSiteAncestor() {
        if (!this.#partitionKey) {
            return false;
        }
        return this.#partitionKey?.hasCrossSiteAncestor;
    }
    setHasCrossSiteAncestor(hasCrossSiteAncestor) {
        if (!this.partitionKey() || !Boolean(this.topLevelSite())) {
            return;
        }
        this.setPartitionKey(this.topLevelSite(), hasCrossSiteAncestor);
    }
    partitionKeyOpaque() {
        if (!this.#partitionKey) {
            return false;
        }
        return (this.topLevelSite() === OPAQUE_PARTITION_KEY);
    }
    setPartitionKeyOpaque() {
        this.addAttribute("partition-key" /* Attribute.PARTITION_KEY */, OPAQUE_PARTITION_KEY);
        this.setPartitionKey(OPAQUE_PARTITION_KEY, false);
    }
    priority() {
        return this.#priority;
    }
    session() {
        // RFC 2965 suggests using Discard attribute to mark session cookies, but this does not seem to be widely used.
        // Check for absence of explicitly max-age or expiry date instead.
        return !(this.#attributes.has("expires" /* Attribute.EXPIRES */) || this.#attributes.has("max-age" /* Attribute.MAX_AGE */));
    }
    path() {
        return this.#attributes.get("path" /* Attribute.PATH */);
    }
    domain() {
        return this.#attributes.get("domain" /* Attribute.DOMAIN */);
    }
    expires() {
        return this.#attributes.get("expires" /* Attribute.EXPIRES */);
    }
    maxAge() {
        return this.#attributes.get("max-age" /* Attribute.MAX_AGE */);
    }
    sourcePort() {
        return this.#attributes.get("source-port" /* Attribute.SOURCE_PORT */);
    }
    sourceScheme() {
        return this.#attributes.get("source-scheme" /* Attribute.SOURCE_SCHEME */);
    }
    size() {
        return this.#size;
    }
    /**
     * @deprecated
     */
    url() {
        if (!this.domain() || !this.path()) {
            return null;
        }
        let port = '';
        const sourcePort = this.sourcePort();
        // Do not include standard ports to ensure the back-end will change standard ports according to the scheme.
        if (sourcePort && sourcePort !== 80 && sourcePort !== 443) {
            port = `:${this.sourcePort()}`;
        }
        // We must not consider the this.sourceScheme() here, otherwise it will be impossible to set a cookie without
        // the Secure attribute from a secure origin.
        return (this.secure() ? 'https://' : 'http://') + this.domain() + port + this.path();
    }
    setSize(size) {
        this.#size = size;
    }
    expiresDate(requestDate) {
        // RFC 6265 indicates that the max-age attribute takes precedence over the expires attribute
        if (this.maxAge()) {
            return new Date(requestDate.getTime() + 1000 * this.maxAge());
        }
        if (this.expires()) {
            return new Date(this.expires());
        }
        return null;
    }
    addAttribute(key, value) {
        if (!key) {
            return;
        }
        switch (key) {
            case "priority" /* Attribute.PRIORITY */:
                this.#priority = value;
                break;
            default:
                this.#attributes.set(key, value);
        }
    }
    hasAttribute(key) {
        return this.#attributes.has(key);
    }
    getAttribute(key) {
        return this.#attributes.get(key);
    }
    setCookieLine(cookieLine) {
        this.#cookieLine = cookieLine;
    }
    getCookieLine() {
        return this.#cookieLine;
    }
    matchesSecurityOrigin(securityOrigin) {
        const hostname = new URL(securityOrigin).hostname;
        return Cookie.isDomainMatch(this.domain(), hostname);
    }
    static isDomainMatch(domain, hostname) {
        // This implementation mirrors
        // https://source.chromium.org/search?q=net::cookie_util::IsDomainMatch()
        //
        // Can domain match in two ways; as a domain cookie (where the cookie
        // domain begins with ".") or as a host cookie (where it doesn't).
        // Some consumers of the CookieMonster expect to set cookies on
        // URLs like http://.strange.url.  To retrieve cookies in this instance,
        // we allow matching as a host cookie even when the domain_ starts with
        // a period.
        if (hostname === domain) {
            return true;
        }
        // Domain cookie must have an initial ".".  To match, it must be
        // equal to url's host with initial period removed, or a suffix of
        // it.
        // Arguably this should only apply to "http" or "https" cookies, but
        // extension cookie tests currently use the funtionality, and if we
        // ever decide to implement that it should be done by preventing
        // such cookies from being set.
        if (domain?.[0] !== '.') {
            return false;
        }
        // The host with a "." prefixed.
        if (domain.substr(1) === hostname) {
            return true;
        }
        // A pure suffix of the host (ok since we know the domain already
        // starts with a ".")
        return hostname.length > domain.length && hostname.endsWith(domain);
    }
}
//# sourceMappingURL=Cookie.js.map