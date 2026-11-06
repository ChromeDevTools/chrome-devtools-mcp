// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';
import { data as metaData } from './MetaHandler.js';
import { data as networkRequestsData } from './NetworkRequestsHandler.js';
import { data as pageLoadMetricsData, MetricName } from './PageLoadMetricsHandler.js';
/**
 * If the LCP resource was an image, and that image was fetched over the
 * network, we want to be able to find the network request in order to construct
 * the critical path for an LCP image.
 * Within the trace file there are `LargestImagePaint::Candidate` events.
 * Within their data object, they contain a `DOMNodeId` property, which maps to
 * the DOM Node ID for that image.
 *
 * This id maps exactly to the `data.nodeId` property that a
 * `LargestContentfulPaint::Candidate` will have. So, when we find an image
 * paint candidate, we can store it, keying it on the node ID.
 * Then, when it comes to finding the network request for an LCP image, we can
 * use the nodeId from the LCP candidate to find the image candidate. That image
 * candidate also contains a `imageUrl` property, which will have the full URL
 * to the image.
 *
 * `BackendNodeId`s are only unique within a given renderer process, so this is
 * also keyed on `ProcessId`.
 **/
let imagePaintsByNodeIdAndProcess = new Map();
let lcpRequestByNavigationId = new Map();
export function reset() {
    imagePaintsByNodeIdAndProcess = new Map();
    lcpRequestByNavigationId = new Map();
}
export function handleEvent(event) {
    if (!Types.Events.isLargestImagePaintCandidate(event) || !event.args.data) {
        return;
    }
    const imagePaintsByNodeId = Platform.MapUtilities.getWithDefault(imagePaintsByNodeIdAndProcess, event.pid, () => new Map());
    imagePaintsByNodeId.set(event.args.data.DOMNodeId, event);
}
export async function finalize() {
    const requests = networkRequestsData().byTime;
    const { traceBounds, navigationsByNavigationId } = metaData();
    const metricScoresByFrameId = pageLoadMetricsData().metricScoresByFrameId;
    for (const [navigationId, navigation] of navigationsByNavigationId) {
        const lcpMetric = metricScoresByFrameId.get(navigation.args.frame)?.get(navigation)?.get(MetricName.LCP);
        const lcpEvent = lcpMetric?.event;
        if (!lcpEvent || !Types.Events.isAnyLargestContentfulPaintCandidate(lcpEvent)) {
            continue;
        }
        const nodeId = lcpEvent.args.data?.nodeId;
        if (!nodeId) {
            continue;
        }
        const lcpImagePaintEvent = imagePaintsByNodeIdAndProcess.get(lcpEvent.pid)?.get(nodeId);
        const lcpUrl = lcpImagePaintEvent?.args.data?.imageUrl;
        if (!lcpUrl) {
            continue;
        }
        const startTime = navigation?.ts ?? traceBounds.min;
        const endTime = lcpImagePaintEvent.ts;
        let lcpRequest;
        for (const request of requests) {
            if (request.ts < startTime) {
                continue;
            }
            if (request.ts >= endTime) {
                break;
            }
            if (request.args.data.url === lcpUrl || request.args.data.redirects.some(r => r.url === lcpUrl)) {
                lcpRequest = request;
                break;
            }
        }
        if (lcpRequest) {
            lcpRequestByNavigationId.set(navigationId, lcpRequest);
        }
    }
}
export function data() {
    return { lcpRequestByNavigationId };
}
export function deps() {
    return ['Meta', 'NetworkRequests', 'PageLoadMetrics'];
}
//# sourceMappingURL=LargestImagePaintHandler.js.map