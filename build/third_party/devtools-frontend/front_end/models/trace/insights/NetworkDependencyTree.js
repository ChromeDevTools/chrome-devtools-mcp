// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Extras from '../extras/extras.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that recommends avoiding chaining critical requests.
     */
    title: 'Network dependency tree',
    /**
     * @description Description of an insight that recommends avoiding chaining critical requests.
     */
    description: '[Avoid chaining critical requests](https://developer.chrome.com/docs/performance/insights/network-dependency-tree) by reducing the length of chains, reducing the download size of resources, or deferring the download of unnecessary resources to improve page load',
    /**
     * @description Description of the warning that recommends avoiding chaining critical requests.
     */
    warningDescription: 'Avoid chaining critical requests by reducing the length of chains, reducing the download size of resources, or deferring the download of unnecessary resources to improve page load',
    /**
     * @description Text status indicating that there aren’t long chaining critical network requests.
     */
    noNetworkDependencyTree: 'No rendering tasks impacted by network dependencies',
    /**
     * @description Text for the maximum critical path latency. This refers to the longest chain of network requests that
     * the browser must download before it can render the page.
     */
    maxCriticalPathLatency: 'Max critical path latency:',
    /**
     * @description Label for a column in a data table; entries will be the network request.
     */
    columnRequest: 'Request',
    /**
     * @description Label for a column in a data table; entries will be the time from main document till current network request.
     */
    columnTime: 'Time',
    /**
     * @description Title of the table of the detected preconnect origins.
     */
    preconnectOriginsTableTitle: 'Preconnected origins',
    /**
     * @description Description of the table of the detected preconnect origins.
     */
    preconnectOriginsTableDescription: '[preconnect](https://developer.chrome.com/docs/lighthouse/performance/uses-rel-preconnect/) hints help the browser establish a connection earlier in the page load, saving time when the first request for that origin is made. The following are the origins that the page preconnected to.',
    /**
     * @description Text status indicating that no origins were preconnected.
     */
    noPreconnectOrigins: 'No origins were preconnected',
    /**
     * @description A warning message that is shown when found more than 4 preconnected links. "preconnect" should not be translated.
     */
    tooManyPreconnectLinksWarning: 'More than 4 `preconnect` connections were found. These should be used sparingly and only to the most important origins.',
    /**
     * @description A warning message that is shown when the user added preconnect for some unnecessary origins. "preconnect" should not be translated.
     */
    unusedWarning: 'Unused preconnect. Only use `preconnect` for origins that the page is likely to request.',
    /**
     * @description A warning message that is shown when the user forgets to set the `crossorigin` HTML attribute, or setting it to an incorrect value, on the link is a common mistake when adding preconnect links. "preconnect" should not be translated.
     */
    crossoriginWarning: 'Unused preconnect. Check that the `crossorigin` attribute is used properly.',
    /**
     * @description Label for a column in a data table; entries will be the source of the origin.
     */
    columnSource: 'Source',
    /**
     * @description Text status indicating that there aren’t preconnect candidates.
     */
    noPreconnectCandidates: 'No additional origins are good candidates for preconnecting',
    /**
     * @description Title of the table that shows the origins that the page should have preconnected to.
     */
    estSavingTableTitle: 'Preconnect candidates',
    /**
     * @description Description of the table that recommends preconnecting to the origins to save time. "preconnect" should not be translated.
     */
    estSavingTableDescription: 'Add [preconnect](https://developer.chrome.com/docs/lighthouse/performance/uses-rel-preconnect/) hints to your most important origins, but try to use no more than 4',
    /**
     * @description Label for a column in a data table; entries will be the origin of a web resource.
     */
    columnOrigin: 'Origin',
    /**
     * @description Label for a column in a data table; entries will be the number of milliseconds the user could reduce page load by if they implemented the suggestions.
     */
    columnWastedMs: 'Est LCP savings',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/NetworkDependencyTree.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
// XHRs are fetched at High priority, but we exclude them, as they are unlikely to be critical
// Images are also non-critical.
const nonCriticalResourceTypes = new Set([
    "Image" /* Protocol.Network.ResourceType.Image */,
    "XHR" /* Protocol.Network.ResourceType.XHR */,
    "Fetch" /* Protocol.Network.ResourceType.Fetch */,
    "EventSource" /* Protocol.Network.ResourceType.EventSource */,
]);
// Preconnect establishes a "clean" socket. Chrome's socket manager will keep an unused socket
// around for 10s. Meaning, the time delta between processing preconnect a request should be <10s,
// otherwise it's wasted. We add a 5s margin so we are sure to capture all key requests.
// @see https://github.com/GoogleChrome/lighthouse/issues/3106#issuecomment-333653747
const PRECONNECT_SOCKET_MAX_IDLE_IN_MS = Types.Timing.Milli(15_000);
const IGNORE_THRESHOLD_IN_MILLISECONDS = Types.Timing.Milli(50);
export const TOO_MANY_PRECONNECTS_THRESHOLD = 4;
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.NETWORK_DEPENDENCY_TREE,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/network-dependency-tree',
        category: InsightCategory.LCP,
        state: partialModel.fail ? 'fail' : 'pass',
        ...partialModel,
    };
}
function isCritical(request, context) {
    // The main resource is always critical.
    if (request.args.data.requestId === context.navigationId) {
        return true;
    }
    // Treat any preloaded resource as non-critical
    if (request.args.data.isLinkPreload) {
        return false;
    }
    // Iframes are considered High Priority but they are not render-blocking
    const isIframe = request.args.data.resourceType === "Document" /* Protocol.Network.ResourceType.Document */ &&
        request.args.data.frame !== context.frameId;
    if (nonCriticalResourceTypes.has(request.args.data.resourceType) || isIframe ||
        // Treat any missed images, primarily favicons, as non-critical resources
        request.args.data.mimeType.startsWith('image/')) {
        return false;
    }
    // Requests that have no initiatorRequest are typically ambiguous late-load assets.
    // Even on the off chance they were important, we don't have any parent to display for them.
    const initiatorUrl = request.args.data.initiator?.url || Helpers.Trace.getStackTraceTopCallFrameInEventPayload(request)?.url;
    if (!initiatorUrl) {
        return false;
    }
    const isBlocking = Helpers.Network.isSyntheticNetworkRequestEventRenderBlocking(request);
    const isHighPriority = Helpers.Network.isSyntheticNetworkRequestHighPriority(request);
    return isHighPriority || isBlocking;
}
function findMaxLeafNode(node) {
    if (node.children.length === 0) {
        return node;
    }
    let maxLeaf = node.children[0];
    for (const child of node.children) {
        const leaf = findMaxLeafNode(child);
        if (leaf.timeFromInitialRequest > maxLeaf.timeFromInitialRequest) {
            maxLeaf = leaf;
        }
    }
    return maxLeaf;
}
function sortRecursively(nodes) {
    for (const node of nodes) {
        if (node.children.length > 0) {
            node.children.sort((nodeA, nodeB) => {
                const leafA = findMaxLeafNode(nodeA);
                const leafB = findMaxLeafNode(nodeB);
                return leafB.timeFromInitialRequest - leafA.timeFromInitialRequest;
            });
            sortRecursively(node.children);
        }
    }
}
function generateNetworkDependencyTree(context) {
    const rootNodes = [];
    const relatedEvents = new Map();
    let maxTime = Types.Timing.Micro(0);
    let fail = false;
    let longestChain = [];
    function addChain(path) {
        if (path.length === 0) {
            return;
        }
        if (path.length >= 2) {
            fail = true;
        }
        const initialRequest = path[0];
        const lastRequest = path[path.length - 1];
        const totalChainTime = Types.Timing.Micro(lastRequest.ts + lastRequest.dur - initialRequest.ts);
        if (totalChainTime > maxTime) {
            maxTime = totalChainTime;
            longestChain = path;
        }
        let currentNodes = rootNodes;
        for (let depth = 0; depth < path.length; ++depth) {
            const request = path[depth];
            // find the request
            let found = currentNodes.find(node => node.request === request);
            if (!found) {
                const timeFromInitialRequest = Types.Timing.Micro(request.ts + request.dur - initialRequest.ts);
                found = {
                    request,
                    timeFromInitialRequest,
                    children: [],
                    relatedRequests: new Set(),
                };
                currentNodes.push(found);
            }
            path.forEach(request => found?.relatedRequests.add(request));
            // TODO(b/372897712): When RelatedInsight supports markdown, remove
            // UIStrings.warningDescription and use UIStrings.description.
            relatedEvents.set(request, depth < 2 ? [] : [i18nString(UIStrings.warningDescription)]);
            currentNodes = found.children;
        }
    }
    // By default `traverse` will discover nodes in BFS-order regardless of dependencies, but
    // here we need traversal in a topological sort order. We'll visit a node only when its
    // dependencies have been met.
    const seenNodes = new Set();
    function getNextNodes(node) {
        return node.getDependents().filter(n => n.getDependencies().every(d => seenNodes.has(d)));
    }
    context.lantern?.graph.traverse((node, traversalPath) => {
        seenNodes.add(node);
        if (node.type !== 'network') {
            return;
        }
        const networkNode = node;
        if (!isCritical(networkNode.rawRequest, context)) {
            return;
        }
        const networkPath = traversalPath.filter(node => node.type === 'network').reverse().map(node => node.rawRequest);
        // Ignore if some ancestor is not a critical request.
        if (networkPath.some(request => (!isCritical(request, context)))) {
            return;
        }
        // Ignore non-network things (like data urls).
        if (node.isNonNetworkProtocol) {
            return;
        }
        addChain(networkPath);
    }, getNextNodes);
    // Mark the longest chain
    if (longestChain.length > 0) {
        let currentNodes = rootNodes;
        for (const request of longestChain) {
            const found = currentNodes.find(node => node.request === request);
            if (found) {
                found.isLongest = true;
                currentNodes = found.children;
            }
            else {
                console.error('Some request in the longest chain is not found');
            }
        }
    }
    sortRecursively(rootNodes);
    return {
        rootNodes,
        maxTime,
        fail,
        relatedEvents,
    };
}
function getSecurityOrigin(url) {
    const parsedURL = new Common.ParsedURL.ParsedURL(url);
    return parsedURL.securityOrigin();
}
function handleLinkResponseHeaderPart(trimmedPart) {
    if (!trimmedPart) {
        // Skip empty string
        return null;
    }
    // Extract URL
    const urlStart = trimmedPart.indexOf('<');
    const urlEnd = trimmedPart.indexOf('>');
    if (urlStart !== 0 || urlEnd === -1 || urlEnd <= urlStart) {
        // Skip parts without a valid URI (must start with '<' and have a closing '>')
        return null;
    }
    const url = trimmedPart.substring(urlStart + 1, urlEnd).trim();
    if (!url) {
        // Skip empty url
        return null;
    }
    // Extract parameters string (everything after '>')
    const paramsString = trimmedPart.substring(urlEnd + 1).trim();
    if (paramsString) {
        const params = paramsString.split(';');
        for (const param of params) {
            const trimmedParam = param.trim();
            if (!trimmedParam) {
                continue;
            }
            const eqIndex = trimmedParam.indexOf('=');
            if (eqIndex === -1) {
                // Skip malformed parameters without an '='
                continue;
            }
            const paramName = trimmedParam.substring(0, eqIndex).trim().toLowerCase();
            let paramValue = trimmedParam.substring(eqIndex + 1).trim();
            // Remove quotes from value if present
            if (paramValue.startsWith('"') && paramValue.endsWith('"')) {
                paramValue = paramValue.substring(1, paramValue.length - 1);
            }
            if (paramName === 'rel' && paramValue === 'preconnect') {
                // Found 'rel=preconnect', no need to process other parameters for this link
                return { url, headerText: trimmedPart };
            }
        }
    }
    return null;
}
/**
 * Parses an HTTP Link header string into an array of url and related header text.
 *
 * Export the function for test purpose.
 * @param linkHeaderValue The value of the HTTP Link header (e.g., '</style.css>; rel=preload; as=style, <https://example.com>; rel="preconnect"').
 * @returns An array of url and header text objects if it contains `rel=preconnect`.
 */
export function handleLinkResponseHeader(linkHeaderValue) {
    if (!linkHeaderValue) {
        return [];
    }
    const preconnectedOrigins = [];
    for (let i = 0; i < linkHeaderValue.length;) {
        const firstUrlEnd = linkHeaderValue.indexOf('>', i);
        if (firstUrlEnd === -1) {
            break;
        }
        const commaIndex = linkHeaderValue.indexOf(',', firstUrlEnd);
        const partEnd = commaIndex !== -1 ? commaIndex : linkHeaderValue.length;
        const part = linkHeaderValue.substring(i, partEnd);
        // This shouldn't be necessary, but we had a bug that created an infinite loop so
        // let's guard against that.
        // See crbug.com/431239629
        if (partEnd + 1 <= i) {
            console.warn('unexpected infinite loop, bailing');
            break;
        }
        i = partEnd + 1;
        const preconnectedOrigin = handleLinkResponseHeaderPart(part.trim());
        if (preconnectedOrigin) {
            preconnectedOrigins.push(preconnectedOrigin);
        }
    }
    return preconnectedOrigins;
}
/** Export the function for test purpose. **/
export function generatePreconnectedOrigins(data, context, contextRequests, preconnectCandidates) {
    const preconnectedOrigins = [];
    for (const event of data.NetworkRequests.linkPreconnectEvents) {
        preconnectedOrigins.push({
            node_id: event.args.data.node_id,
            frame: event.args.data.frame,
            url: event.args.data.url,
            // For each origin the page wanted to preconnect to:
            // - if we found no network requests to that origin at all then we issue a unused warning
            unused: !contextRequests.some(request => getSecurityOrigin(event.args.data.url) === getSecurityOrigin(request.args.data.url)),
            // - else (we found network requests to the same origin) and if some of those network requests is too slow (if
            //   they are preconnect candidates), then we issue a unused warning with crossorigin hint
            crossorigin: preconnectCandidates.some(candidate => candidate.origin === getSecurityOrigin(event.args.data.url)),
            source: 'DOM',
        });
    }
    const documentRequest = data.NetworkRequests.byId.get(context.navigationId);
    documentRequest?.args.data.responseHeaders?.forEach(header => {
        if (header.name.toLowerCase() === 'link') {
            const preconnectedOriginsFromResponseHeader = handleLinkResponseHeader(header.value); // , documentRequest);
            preconnectedOriginsFromResponseHeader?.forEach(origin => preconnectedOrigins.push({
                url: origin.url,
                headerText: origin.headerText,
                request: documentRequest,
                // For each origin the page wanted to preconnect to:
                // - if we found no network requests to that origin at all then we issue a unused warning
                unused: !contextRequests.some(request => getSecurityOrigin(origin.url) === getSecurityOrigin(request.args.data.url)),
                // - else (we found network requests to the same origin) and if some of those network requests is too slow (if
                //   they are preconnect candidates), then we issue a unused warning with crossorigin hint
                crossorigin: preconnectCandidates.some(candidate => candidate.origin === getSecurityOrigin(origin.url)),
                source: 'ResponseHeader',
            }));
        }
    });
    return preconnectedOrigins;
}
function hasValidTiming(request) {
    return !!request.args.data.timing && request.args.data.timing.connectEnd >= 0 &&
        request.args.data.timing.connectStart >= 0;
}
function hasAlreadyConnectedToOrigin(request) {
    const { timing } = request.args.data;
    if (!timing) {
        return false;
    }
    // When these values are given as -1, that means the page has
    // a connection for this origin and paid these costs already.
    if (timing.dnsStart === -1 && timing.dnsEnd === -1 && timing.connectStart === -1 && timing.connectEnd === -1) {
        return true;
    }
    // Less understood: if the connection setup took no time at all, consider
    // it the same as the above. It is unclear if this is correct, or is even possible.
    if (timing.dnsEnd - timing.dnsStart === 0 && timing.connectEnd - timing.connectStart === 0) {
        return true;
    }
    return false;
}
function socketStartTimeIsBelowThreshold(request, mainResource) {
    const timeSinceMainEnd = Math.max(0, request.args.data.syntheticData.sendStartTime - mainResource.args.data.syntheticData.finishTime);
    return Helpers.Timing.microToMilli(timeSinceMainEnd) < PRECONNECT_SOCKET_MAX_IDLE_IN_MS;
}
function candidateRequestsByOrigin(data, mainResource, contextRequests, lcpGraphURLs) {
    const origins = new Map();
    contextRequests.forEach(request => {
        if (!hasValidTiming(request)) {
            return;
        }
        const initiator = Extras.Initiators.getNetworkInitiator(data, request);
        if (initiator === mainResource) {
            return;
        }
        const url = new URL(request.args.data.url);
        // Filter out urls that do not have an origin (data, file, etc).
        if (url.origin === 'null') {
            return;
        }
        const mainOrigin = new URL(mainResource.args.data.url).origin;
        // Filter out all resources that have the same origin. We're already connected.
        if (url.origin === mainOrigin) {
            return;
        }
        // Filter out anything that wasn't part of LCP. Only recommend important origins.
        if (!lcpGraphURLs.has(request.args.data.url)) {
            return;
        }
        // Filter out all resources where origins are already resolved.
        if (hasAlreadyConnectedToOrigin(request)) {
            return;
        }
        // Make sure the requests are below the PRECONNECT_SOCKET_MAX_IDLE_IN_MS (15s) mark.
        if (!socketStartTimeIsBelowThreshold(request, mainResource)) {
            return;
        }
        const originRequests = Platform.MapUtilities.getWithDefault(origins, url.origin, () => []);
        originRequests.push(request);
    });
    return origins;
}
/** Export the function for test purpose. **/
export function generatePreconnectCandidates(data, context, contextRequests) {
    if (!context.lantern) {
        return [];
    }
    const documentRequest = data.NetworkRequests.byId.get(context.navigationId);
    if (!documentRequest) {
        return [];
    }
    const { rtt, additionalRttByOrigin } = context.lantern.simulator.getOptions();
    const lcpGraph = context.lantern.metrics.largestContentfulPaint.pessimisticGraph;
    const fcpGraph = context.lantern.metrics.firstContentfulPaint.pessimisticGraph;
    const lcpGraphURLs = new Set();
    lcpGraph.traverse(node => {
        if (node.type === 'network') {
            lcpGraphURLs.add(node.request.url);
        }
    });
    const fcpGraphURLs = new Set();
    fcpGraph.traverse(node => {
        if (node.type === 'network') {
            fcpGraphURLs.add(node.request.url);
        }
    });
    const groupedOrigins = candidateRequestsByOrigin(data, documentRequest, contextRequests, lcpGraphURLs);
    let maxWastedLcp = Types.Timing.Milli(0);
    let maxWastedFcp = Types.Timing.Milli(0);
    let preconnectCandidates = [];
    groupedOrigins.forEach(requests => {
        const firstRequestOfOrigin = requests[0];
        // Skip the origin if we don't have timing information
        if (!firstRequestOfOrigin.args.data.timing) {
            return;
        }
        const firstRequestOfOriginParsedURL = new Common.ParsedURL.ParsedURL(firstRequestOfOrigin.args.data.url);
        const origin = firstRequestOfOriginParsedURL.securityOrigin();
        // Approximate the connection time with the duration of TCP (+potentially SSL) handshake
        // DNS time can be large but can also be 0 if a commonly used origin that's cached, so make
        // no assumption about DNS.
        const additionalRtt = additionalRttByOrigin.get(origin) ?? 0;
        let connectionTime = Types.Timing.Milli(rtt + additionalRtt);
        // TCP Handshake will be at least 2 RTTs for TLS connections
        if (firstRequestOfOriginParsedURL.scheme === 'https') {
            connectionTime = Types.Timing.Milli(connectionTime * 2);
        }
        const timeBetweenMainResourceAndDnsStart = Types.Timing.Micro(firstRequestOfOrigin.args.data.syntheticData.sendStartTime -
            documentRequest.args.data.syntheticData.finishTime +
            Helpers.Timing.milliToMicro(firstRequestOfOrigin.args.data.timing.dnsStart));
        const wastedMs = Math.min(connectionTime, Helpers.Timing.microToMilli(timeBetweenMainResourceAndDnsStart));
        if (wastedMs < IGNORE_THRESHOLD_IN_MILLISECONDS) {
            return;
        }
        maxWastedLcp = Math.max(wastedMs, maxWastedLcp);
        if (fcpGraphURLs.has(firstRequestOfOrigin.args.data.url)) {
            maxWastedFcp = Math.max(wastedMs, maxWastedFcp);
        }
        preconnectCandidates.push({
            origin,
            wastedMs,
        });
    });
    preconnectCandidates = preconnectCandidates.sort((a, b) => b.wastedMs - a.wastedMs);
    return preconnectCandidates.slice(0, TOO_MANY_PRECONNECTS_THRESHOLD);
}
export function isNetworkDependencyTreeInsight(model) {
    return model.insightKey === InsightKeys.NETWORK_DEPENDENCY_TREE;
}
export function generateInsight(data, context) {
    if (!context.navigation || !('navigationId' in context)) {
        return finalize({
            rootNodes: [],
            maxTime: 0,
            fail: false,
            preconnectedOrigins: [],
            preconnectCandidates: [],
        });
    }
    const { rootNodes, maxTime, fail, relatedEvents, } = generateNetworkDependencyTree(context);
    const isWithinContext = (event) => Helpers.Timing.eventIsInBounds(event, context.bounds);
    const contextRequests = data.NetworkRequests.byTime.filter(isWithinContext);
    const preconnectCandidates = generatePreconnectCandidates(data, context, contextRequests);
    const preconnectedOrigins = generatePreconnectedOrigins(data, context, contextRequests, preconnectCandidates);
    return finalize({
        rootNodes,
        maxTime,
        fail,
        relatedEvents,
        preconnectedOrigins,
        preconnectCandidates,
    });
}
export function createOverlays(model) {
    function walk(nodes, overlays) {
        nodes.forEach(node => {
            overlays.push({
                type: 'ENTRY_OUTLINE',
                entry: node.request,
                outlineReason: 'ERROR',
            });
            walk(node.children, overlays);
        });
    }
    const overlays = [];
    walk(model.rootNodes, overlays);
    return overlays;
}
//# sourceMappingURL=NetworkDependencyTree.js.map