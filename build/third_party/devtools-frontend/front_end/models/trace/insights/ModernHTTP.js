// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that recommends using HTTP/2 over HTTP/1.1 because of the performance benefits. "HTTP" should not be translated.
     */
    title: 'Modern HTTP',
    /**
     * @description Description of an insight that recommends using HTTP/2 over HTTP/1.1 because of the performance benefits. "HTTP" should not be translated.
     */
    description: 'HTTP/2 and HTTP/3 offer many benefits over HTTP/1.1, such as multiplexing. [Learn more about using modern HTTP](https://developer.chrome.com/docs/performance/insights/modern-http).',
    /**
     * @description Column header for a table where each cell represents a network request.
     */
    request: 'Request',
    /**
     * @description Column header for a table where each cell represents the protocol of a network request.
     */
    protocol: 'Protocol',
    /**
     * @description Text explaining that there were no requests that were slowed down by using HTTP/1.1. "HTTP/1.1" should not be translated.
     */
    noOldProtocolRequests: 'No requests used HTTP/1.1, or its current use of HTTP/1.1 doesn’t present a significant optimization opportunity. HTTP/1.1 requests are only flagged if six or more static assets originate from the same origin, and they aren’t served from a local development environment or a third-party source.',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/ModernHTTP.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export function isModernHTTPInsight(model) {
    return model.insightKey === InsightKeys.MODERN_HTTP;
}
/**
 * Determines whether a network request is a "static resource" that would benefit from H2 multiplexing.
 * XHRs, tracking pixels, etc generally don't benefit as much because they aren't requested en-masse
 * for the same origin at the exact same time.
 */
function isMultiplexableStaticAsset(request, entityMappings, firstPartyEntity) {
    if (!Helpers.Network.STATIC_RESOURCE_TYPES.has(request.args.data.resourceType)) {
        return false;
    }
    // Resources from third-parties that are less than 100 bytes are usually tracking pixels, not actual resources.
    // They can masquerade as static types though (gifs, documents, etc)
    if (request.args.data.decodedBodyLength < 100) {
        const entity = entityMappings.entityByEvent.get(request);
        if (entity) {
            // Third-party assets are multiplexable in their first-party context.
            if (firstPartyEntity?.name === entity.name) {
                return true;
            }
            // Skip recognizable third-parties' requests.
            if (!entity.isUnrecognized) {
                return false;
            }
        }
    }
    return true;
}
/**
 * Determine the set of resources that aren't HTTP/2 but should be.
 * We're a little conservative about what we surface for a few reasons:
 *
 *    - The simulator approximation of HTTP/2 is a little more generous than reality.
 *    - There's a bit of debate surrounding HTTP/2 due to its worse performance in environments with high packet loss. [1][2][3]
 *    - It's something that you'd have absolutely zero control over with a third-party (can't defer to fix it for example).
 *
 * Therefore, we only surface requests that were...
 *
 *    - Served over HTTP/1.1 or earlier
 *    - Served over an origin that serves at least 6 static asset requests
 *      (if there aren't more requests than browser's max/host, multiplexing isn't as big a deal)
 *    - Not served on localhost (h2 is a pain to deal with locally & and CI)
 *
 * [1] https://news.ycombinator.com/item?id=19086639
 * [2] https://www.twilio.com/blog/2017/10/http2-issues.html
 * [3] https://www.cachefly.com/http-2-is-not-a-magic-bullet/
 */
export function determineHttp1Requests(requests, entityMappings, firstPartyEntity) {
    const http1Requests = [];
    const groupedByOrigin = new Map();
    for (const record of requests) {
        const url = new URL(record.args.data.url);
        if (!isMultiplexableStaticAsset(record, entityMappings, firstPartyEntity)) {
            continue;
        }
        if (Helpers.Network.isSyntheticNetworkRequestLocalhost(record)) {
            continue;
        }
        const originRequests = Platform.MapUtilities.getWithDefault(groupedByOrigin, url.origin, () => []);
        originRequests.push(record);
    }
    const seenURLs = new Set();
    for (const request of requests) {
        // Skip duplicates.
        if (seenURLs.has(request.args.data.url)) {
            continue;
        }
        // Check if record is not served through the service worker, servicer worker uses http/1.1 as a protocol.
        // These can generate false positives (bug: https://github.com/GoogleChrome/lighthouse/issues/7158).
        if (request.args.data.fromServiceWorker) {
            continue;
        }
        // Test the protocol to see if it was http/1.1.
        const isOldHttp = /HTTP\/[01][.\d]?/i.test(request.args.data.protocol);
        if (!isOldHttp) {
            continue;
        }
        const url = new URL(request.args.data.url);
        // Check if the origin has enough requests to bother flagging.
        const group = groupedByOrigin.get(url.origin) || [];
        if (group.length < 6) {
            continue;
        }
        seenURLs.add(request.args.data.url);
        http1Requests.push(request);
    }
    return http1Requests;
}
/**
 * Computes the estimated effect of all results being converted to http/2 on the provided graph.
 */
function computeWasteWithGraph(urlsToChange, graph, simulator) {
    const simulationBefore = simulator.simulate(graph);
    // Update all the protocols to reflect implementing our recommendations
    const originalProtocols = new Map();
    graph.traverse(node => {
        if (node.type !== 'network') {
            return;
        }
        if (!urlsToChange.has(node.request.url)) {
            return;
        }
        originalProtocols.set(node.request.requestId, node.request.protocol);
        node.request.protocol = 'h2';
    });
    const simulationAfter = simulator.simulate(graph);
    // Restore the original protocol after we've done our simulation
    graph.traverse(node => {
        if (node.type !== 'network') {
            return;
        }
        const originalProtocol = originalProtocols.get(node.request.requestId);
        if (originalProtocol === undefined) {
            return;
        }
        node.request.protocol = originalProtocol;
    });
    const savings = simulationBefore.timeInMs - simulationAfter.timeInMs;
    return Platform.NumberUtilities.floor(savings, 1 / 10);
}
function computeMetricSavings(http1Requests, context) {
    if (!context.navigation || !('lantern' in context) || !context.lantern) {
        return;
    }
    const urlsToChange = new Set(http1Requests.map(r => r.args.data.url));
    const fcpGraph = context.lantern.metrics.firstContentfulPaint.optimisticGraph;
    const lcpGraph = context.lantern.metrics.largestContentfulPaint.optimisticGraph;
    return {
        FCP: computeWasteWithGraph(urlsToChange, fcpGraph, context.lantern.simulator),
        LCP: computeWasteWithGraph(urlsToChange, lcpGraph, context.lantern.simulator),
    };
}
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.MODERN_HTTP,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/modern-http',
        category: InsightCategory.LCP,
        state: partialModel.http1Requests.length > 0 ? 'fail' : 'pass',
        ...partialModel,
        relatedEvents: partialModel.http1Requests,
    };
}
export function generateInsight(data, context) {
    const isWithinContext = (event) => Helpers.Timing.eventIsInBounds(event, context.bounds);
    const contextRequests = data.NetworkRequests.byTime.filter(isWithinContext);
    const entityMappings = data.NetworkRequests.entityMappings;
    let firstPartyUrl = data.Meta.mainFrameURL;
    if (context.navigation && !Types.Events.isSoftNavigationStart(context.navigation)) {
        firstPartyUrl = context.navigation.args.data?.documentLoaderURL ?? firstPartyUrl;
    }
    const firstPartyEntity = Handlers.Helpers.getEntityForUrl(firstPartyUrl, entityMappings);
    const http1Requests = determineHttp1Requests(contextRequests, entityMappings, firstPartyEntity ?? null);
    return finalize({
        http1Requests,
        metricSavings: computeMetricSavings(http1Requests, context),
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
    return model.http1Requests.map(req => createOverlayForRequest(req)) ?? [];
}
//# sourceMappingURL=ModernHTTP.js.map