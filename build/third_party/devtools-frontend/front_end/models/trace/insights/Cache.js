// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Helpers from '../helpers/helpers.js';
import { metricSavingsForWastedBytes } from './Common.js';
import { linearInterpolation } from './Statistics.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides information and suggestions of resources that could improve their caching.
     */
    title: 'Use efficient cache lifetimes',
    /**
     * @description Text to tell the user about how caching can help improve performance.
     */
    description: 'A long cache lifetime can speed up repeat visits to your page. [Learn more about caching](https://developer.chrome.com/docs/performance/insights/cache).',
    /**
     * @description Column for a font loaded by the page to render text.
     */
    requestColumn: 'Request',
    /**
     * @description Column for a resource cache's Time To Live.
     */
    cacheTTL: 'Cache TTL',
    /**
     * @description Text describing that there were no requests found that need caching.
     */
    noRequestsToCache: 'No requests with inefficient cache policies',
    /**
     * @description Table row value representing the remaining items not shown in the table due to size constraints. This row will always represent at least 2 items.
     * @example {5} PH1
     */
    others: '{PH1} others',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/Cache.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
// Threshold for cache hits.
const IGNORE_THRESHOLD_IN_PERCENT = 0.925;
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.CACHE,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/cache',
        category: InsightCategory.ALL,
        state: partialModel.requests.length > 0 ? 'fail' : 'pass',
        ...partialModel,
    };
}
/**
 * Determines if a request is "cacheable".
 * A request is "cacheable" if it is of the appropriate protocol and resource type
 * (see Helpers.Network.NON_NETWORK_SCHEMES and Helpers.Network.STATIC_RESOURCE_TYPE)
 * and has the appropriate statusCodes.
 */
export function isCacheable(request) {
    // Caching doesn't make sense for requests not loaded over the network.
    if (Helpers.Network.NON_NETWORK_SCHEMES.includes(request.args.data.protocol)) {
        return false;
    }
    return Boolean(Helpers.Network.CACHEABLE_STATUS_CODES.has(request.args.data.statusCode) &&
        Helpers.Network.STATIC_RESOURCE_TYPES.has(request.args.data.resourceType || "Other" /* Protocol.Network.ResourceType.Other */));
}
/**
 * Returns max-age if defined, otherwise expires header if defined, and null if not.
 */
export function computeCacheLifetimeInSeconds(headers, cacheControl) {
    if (cacheControl?.['max-age'] !== undefined) {
        return cacheControl['max-age'];
    }
    const expiresHeaders = headers.find(h => h.name === 'expires')?.value ?? null;
    if (expiresHeaders) {
        const expires = new Date(expiresHeaders).getTime();
        // Treat expires values as having already expired.
        if (!expires) {
            return 0;
        }
        return Math.ceil((expires - Date.now()) / 1000);
    }
    return null;
}
/**
 * Computes the percent likelihood that a return visit will be within the cache lifetime, based on
 * historical Chrome UMA stats (see RESOURCE_AGE_IN_HOURS_DECILES comment).
 *
 * This function returns values on this curve: https://www.desmos.com/calculator/eaqiszhugy (but using seconds, rather than hours)
 * See http://github.com/GoogleChrome/lighthouse/pull/3531 for history.
 */
function getCacheHitProbability(maxAgeInSeconds) {
    // This array contains the hand wavy distribution of the age of a resource in hours at the time of
    // cache hit at 0th, 10th, 20th, 30th, etc percentiles. This is used to compute `wastedMs` since there
    // are clearly diminishing returns to cache duration i.e. 6 months is not 2x better than 3 months.
    // Based on UMA stats for HttpCache.StaleEntry.Validated.Age. see https://www.desmos.com/calculator/jjwc5mzuwd
    // This UMA data is from 2017 but the metric isn't tracked any longer in 2025.
    const RESOURCE_AGE_IN_HOURS_DECILES = [0, 0.2, 1, 3, 8, 12, 24, 48, 72, 168, 8760, Infinity];
    const maxAgeInHours = maxAgeInSeconds / 3600;
    const upperDecileIndex = RESOURCE_AGE_IN_HOURS_DECILES.findIndex(decile => decile >= maxAgeInHours);
    // Clip the likelihood between 0 and 1
    if (upperDecileIndex === RESOURCE_AGE_IN_HOURS_DECILES.length - 1) {
        return 1;
    }
    if (upperDecileIndex === 0) {
        return 0;
    }
    // Use the two closest decile points as control points
    const upperDecileValue = RESOURCE_AGE_IN_HOURS_DECILES[upperDecileIndex];
    const lowerDecileValue = RESOURCE_AGE_IN_HOURS_DECILES[upperDecileIndex - 1];
    const upperDecile = upperDecileIndex / 10;
    const lowerDecile = (upperDecileIndex - 1) / 10;
    // Approximate the real likelihood with linear interpolation
    return linearInterpolation(lowerDecileValue, lowerDecile, upperDecileValue, upperDecile, maxAgeInHours);
}
export function getCombinedHeaders(responseHeaders) {
    const headers = new Map();
    for (const header of responseHeaders) {
        const name = header.name.toLowerCase();
        if (headers.get(name)) {
            headers.set(name, `${headers.get(name)}, ${header.value}`);
        }
        else {
            headers.set(name, header.value);
        }
    }
    return headers;
}
/**
 * Returns whether a request contains headers that disable caching.
 * Disabled caching is checked on the 'cache-control' and 'pragma' headers.
 */
export function cachingDisabled(headers, parsedCacheControl) {
    const cacheControl = headers?.get('cache-control') ?? null;
    const pragma = headers?.get('pragma') ?? null;
    // The HTTP/1.0 Pragma header can disable caching if cache-control is not set, see https://tools.ietf.org/html/rfc7234#section-5.4
    if (!cacheControl && pragma?.includes('no-cache')) {
        return true;
    }
    // If we have any of these, the user intentionally doesn't want to cache.
    if (parsedCacheControl &&
        (parsedCacheControl['must-revalidate'] || parsedCacheControl['no-cache'] || parsedCacheControl['no-store'] ||
            parsedCacheControl['private'])) {
        return true;
    }
    return false;
}
export function isCacheInsight(model) {
    return model.insightKey === InsightKeys.CACHE;
}
export function generateInsight(data, context) {
    const isWithinContext = (event) => Helpers.Timing.eventIsInBounds(event, context.bounds);
    const contextRequests = data.NetworkRequests.byTime.filter(isWithinContext);
    const results = [];
    let totalWastedBytes = 0;
    const wastedBytesByRequestId = new Map();
    for (const req of contextRequests) {
        if (!req.args.data.responseHeaders || !isCacheable(req)) {
            continue;
        }
        const headers = getCombinedHeaders(req.args.data.responseHeaders);
        const cacheControl = headers.get('cache-control') ?? null;
        const parsedDirectives = Helpers.Network.parseCacheControl(cacheControl);
        // Skip requests that are deliberately avoiding caching.
        if (cachingDisabled(headers, parsedDirectives)) {
            continue;
        }
        let ttl = computeCacheLifetimeInSeconds(req.args.data.responseHeaders, parsedDirectives);
        // Ignore if a non-positive number.
        if (ttl !== null && (!Number.isFinite(ttl) || ttl <= 0)) {
            continue;
        }
        ttl = ttl || 0;
        // Ignore >= 30d.
        const ttlDays = ttl / 86400;
        if (ttlDays >= 30) {
            continue;
        }
        // If cache lifetime is high enough, let's skip.
        const cacheHitProbability = getCacheHitProbability(ttl);
        if (cacheHitProbability > IGNORE_THRESHOLD_IN_PERCENT) {
            continue;
        }
        const transferSize = req.args.data.encodedDataLength || 0;
        const wastedBytes = (1 - cacheHitProbability) * transferSize;
        wastedBytesByRequestId.set(req.args.data.requestId, wastedBytes);
        totalWastedBytes += wastedBytes;
        results.push({ request: req, ttl, wastedBytes });
    }
    // Sort by transfer size.
    results.sort((a, b) => {
        return b.request.args.data.decodedBodyLength - a.request.args.data.decodedBodyLength || a.ttl - b.ttl;
    });
    return finalize({
        relatedEvents: results.map(r => r.request),
        requests: results,
        metricSavings: metricSavingsForWastedBytes(wastedBytesByRequestId, context),
        wastedBytes: totalWastedBytes,
    });
}
export function createOverlayForRequest(request) {
    return {
        type: 'ENTRY_OUTLINE',
        entry: request,
        outlineReason: 'ERROR',
    };
}
export function createOverlays(model) {
    return model.requests.map(req => createOverlayForRequest(req.request));
}
//# sourceMappingURL=Cache.js.map