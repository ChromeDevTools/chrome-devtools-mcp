// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// A DNS lookup will usually take ~1-2 roundtrips of connection latency plus the extra DNS routing time.
// Example: https://www.webpagetest.org/result/180703_3A_e33ec79747c002ed4d7bcbfc81462203/1/details/#waterfall_view_step1
// Example: https://www.webpagetest.org/result/180707_1M_89673eb633b5d98386de95dfcf9b33d5/1/details/#waterfall_view_step1
// DNS is highly variable though, many times it's a little more than 1, but can easily be 4-5x RTT.
// We'll use 2 since it seems to give the most accurate results on average, but this can be tweaked.
const DNS_RESOLUTION_RTT_MULTIPLIER = 2;
class DNSCache {
    static rttMultiplier = DNS_RESOLUTION_RTT_MULTIPLIER;
    rtt;
    resolvedDomainNames;
    constructor({ rtt }) {
        this.rtt = rtt;
        this.resolvedDomainNames = new Map();
    }
    getTimeUntilResolution(request, options) {
        const { requestedAt = 0, shouldUpdateCache = false } = options || {};
        const domain = request.parsedURL.host;
        const cacheEntry = this.resolvedDomainNames.get(domain);
        let timeUntilResolved = this.rtt * DNSCache.rttMultiplier;
        if (cacheEntry) {
            const timeUntilCachedIsResolved = Math.max(cacheEntry.resolvedAt - requestedAt, 0);
            timeUntilResolved = Math.min(timeUntilCachedIsResolved, timeUntilResolved);
        }
        const resolvedAt = requestedAt + timeUntilResolved;
        if (shouldUpdateCache) {
            this.updateCacheResolvedAtIfNeeded(request, resolvedAt);
        }
        return timeUntilResolved;
    }
    updateCacheResolvedAtIfNeeded(request, resolvedAt) {
        const domain = request.parsedURL.host;
        const cacheEntry = this.resolvedDomainNames.get(domain) || { resolvedAt };
        cacheEntry.resolvedAt = Math.min(cacheEntry.resolvedAt, resolvedAt);
        this.resolvedDomainNames.set(domain, cacheEntry);
    }
    /**
     * Forcefully sets the DNS resolution time for a request.
     * Useful for testing and alternate execution simulations.
     */
    setResolvedAt(domain, resolvedAt) {
        this.resolvedDomainNames.set(domain, { resolvedAt });
    }
}
export { DNSCache };
//# sourceMappingURL=DNSCache.js.map