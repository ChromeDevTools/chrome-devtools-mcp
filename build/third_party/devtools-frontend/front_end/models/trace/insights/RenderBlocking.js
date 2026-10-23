// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import { InsightCategory, InsightKeys, InsightWarning, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides the user with the list of network requests that blocked and therefore slowed down the page rendering and becoming visible to the user.
     */
    title: 'Render-blocking requests',
    /**
     * @description Text to describe that there are requests blocking rendering, which may affect LCP.
     */
    description: `Requests are blocking the page’s initial render, which may delay LCP. [Deferring or inlining](https://developer.chrome.com/docs/performance/insights/render-blocking) can move these network requests out of the critical path.`,
    /**
     * @description Label to describe a network request (that happens to be render-blocking).
     */
    renderBlockingRequest: 'Request',
    /**
     * @description Label used for a time duration.
     */
    duration: 'Duration',
    /**
     * @description Text status indicating that no requests blocked the initial render of a navigation.
     */
    noRenderBlocking: 'No render-blocking requests for this navigation',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/RenderBlocking.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export function isRenderBlockingInsight(insight) {
    return insight.insightKey === 'RenderBlocking';
}
// Because of the way we detect blocking stylesheets, asynchronously loaded
// CSS with link[rel=preload] and an onload handler (see https://github.com/filamentgroup/loadCSS)
// can be falsely flagged as blocking. Therefore, ignore stylesheets that loaded fast enough
// to possibly be non-blocking (and they have minimal impact anyway).
const MINIMUM_WASTED_MS = 50;
/**
 * Given a simulation's nodeTimings, return an object with the nodes/timing keyed by network URL
 */
function getNodesAndTimingByRequestId(nodeTimings) {
    const timingByNodeId = new Map();
    for (const [node, nodeTiming] of nodeTimings) {
        timingByNodeId.set(node.id, nodeTiming);
    }
    const requestIdToNode = new Map();
    for (const [node, nodeTiming] of nodeTimings) {
        if (node.type !== 'network' || node.request.redirectDestination) {
            continue;
        }
        let duration = nodeTiming.duration;
        let startTime = nodeTiming.startTime;
        for (const redirect of node.request.redirects ?? []) {
            const redirectTiming = timingByNodeId.get(redirect.requestId);
            if (redirectTiming) {
                duration += redirectTiming.duration;
                startTime = Math.min(startTime, redirectTiming.startTime);
            }
        }
        const backendRequestId = node.request.rawRequest?.args.data.requestId ?? node.request.requestId;
        requestIdToNode.set(backendRequestId, {
            node,
            nodeTiming: { startTime, endTime: nodeTiming.endTime, duration },
        });
    }
    return requestIdToNode;
}
function estimateSavingsWithGraphs(deferredIds, lanternContext) {
    const simulator = lanternContext.simulator;
    const fcpGraph = lanternContext.metrics.firstContentfulPaint.optimisticGraph;
    const { nodeTimings } = lanternContext.simulator.simulate(fcpGraph);
    const adjustedNodeTimings = new Map(nodeTimings);
    const totalChildNetworkBytes = 0;
    const minimalFCPGraph = fcpGraph.cloneWithRelationships(node => {
        // If a node can be deferred, exclude it from the new FCP graph
        const canDeferRequest = deferredIds.has(node.id);
        return !canDeferRequest;
    });
    if (minimalFCPGraph.type !== 'network') {
        throw new Error('minimalFCPGraph not a NetworkNode');
    }
    // Recalculate the "before" time based on our adjusted node timings.
    const estimateBeforeInline = Math.max(...Array.from(Array.from(adjustedNodeTimings).map(timing => timing[1].endTime)));
    // Add the inlined bytes to the HTML response
    const originalTransferSize = minimalFCPGraph.request.transferSize;
    const safeTransferSize = originalTransferSize || 0;
    minimalFCPGraph.request.transferSize = safeTransferSize + totalChildNetworkBytes;
    const estimateAfterInline = simulator.simulate(minimalFCPGraph).timeInMs;
    minimalFCPGraph.request.transferSize = originalTransferSize;
    return Math.round(Math.max(estimateBeforeInline - estimateAfterInline, 0));
}
function hasImageLCP(data, context) {
    return data.LargestImagePaint.lcpRequestByNavigationId.has(context.navigationId);
}
function computeSavings(data, context, renderBlockingRequests) {
    if (!context.lantern) {
        return;
    }
    const nodesAndTimingsByRequestId = getNodesAndTimingByRequestId(context.lantern.metrics.firstContentfulPaint.optimisticEstimate.nodeTimings);
    const metricSavings = { FCP: 0, LCP: 0 };
    const requestIdToWastedMs = new Map();
    const deferredNodeIds = new Set();
    for (const request of renderBlockingRequests) {
        const nodeAndTiming = nodesAndTimingsByRequestId.get(request.args.data.requestId);
        if (!nodeAndTiming) {
            continue;
        }
        const { node, nodeTiming } = nodeAndTiming;
        // Mark this node, any redirects leading to it, and all its dependents as deferrable
        for (const redirect of node.request.redirects ?? []) {
            deferredNodeIds.add(redirect.requestId);
        }
        node.traverse(node => deferredNodeIds.add(node.id));
        // "wastedMs" is the download time of the network request, responseReceived - requestSent
        const wastedMs = Math.round(nodeTiming.duration);
        if (wastedMs < MINIMUM_WASTED_MS) {
            continue;
        }
        requestIdToWastedMs.set(request.args.data.requestId, wastedMs);
    }
    if (requestIdToWastedMs.size) {
        metricSavings.FCP = estimateSavingsWithGraphs(deferredNodeIds, context.lantern);
        // In most cases, render-blocking resources only affect LCP if LCP isn't an image.
        if (!hasImageLCP(data, context)) {
            metricSavings.LCP = metricSavings.FCP;
        }
    }
    return { metricSavings, requestIdToWastedMs };
}
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.RENDER_BLOCKING,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/render-blocking',
        category: InsightCategory.LCP,
        state: partialModel.renderBlockingRequests.length > 0 ? 'fail' : 'pass',
        ...partialModel,
    };
}
export function generateInsight(data, context) {
    if (!context.navigation || !('navigationId' in context)) {
        return finalize({
            renderBlockingRequests: [],
        });
    }
    const firstPaintTs = data.PageLoadMetrics.metricScoresByFrameId.get(context.frameId)
        ?.get(context.navigation)
        ?.get(Handlers.ModelHandlers.PageLoadMetrics.MetricName.FP)
        ?.event?.ts;
    if (!firstPaintTs) {
        return finalize({
            renderBlockingRequests: [],
            warnings: [InsightWarning.NO_FP],
        });
    }
    let renderBlockingRequests = [];
    for (const req of data.NetworkRequests.byTime) {
        if (req.args.data.frame !== context.frameId) {
            continue;
        }
        if (!Helpers.Network.isSyntheticNetworkRequestEventRenderBlocking(req)) {
            continue;
        }
        if (req.args.data.syntheticData.finishTime > firstPaintTs) {
            continue;
        }
        // If a request is marked `in_body_parser_blocking` it should only be considered render-blocking if it is a
        // high enough priority. Some requests (e.g. scripts) are not marked as high priority if they are fetched
        // after a non-preloaded image. (See "early" definition in https://web.dev/articles/fetch-priority)
        //
        // There are edge cases and exceptions (e.g. priority hints) but this gives us the best approximation
        // of render-blocking resources in the document body.
        if (req.args.data.renderBlocking === 'in_body_parser_blocking') {
            const priority = req.args.data.priority;
            const isScript = req.args.data.resourceType === "Script" /* Protocol.Network.ResourceType.Script */;
            const isBlockingScript = isScript && priority === "High" /* Protocol.Network.ResourcePriority.High */;
            if (priority !== "VeryHigh" /* Protocol.Network.ResourcePriority.VeryHigh */ && !isBlockingScript) {
                continue;
            }
        }
        const navigation = Helpers.Trace.getNavigationForTraceEvent(req, context.frameId, data.Meta.navigationsByFrameId);
        if (navigation === context.navigation) {
            renderBlockingRequests.push(req);
        }
    }
    const savings = computeSavings(data, context, renderBlockingRequests);
    // Sort by request duration for insights.
    renderBlockingRequests = renderBlockingRequests.sort((a, b) => {
        return b.dur - a.dur;
    });
    return finalize({
        relatedEvents: renderBlockingRequests,
        renderBlockingRequests,
        ...savings,
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
    return model.renderBlockingRequests.map(request => createOverlayForRequest(request));
}
//# sourceMappingURL=RenderBlocking.js.map