// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Graph from '../graph/graph.js';
import { Metric } from './Metric.js';
class FirstContentfulPaint extends Metric {
    static get coefficients() {
        return {
            intercept: 0,
            optimistic: 0.5,
            pessimistic: 0.5,
        };
    }
    /**
     * Computes the set of URLs that *appeared* to be render-blocking based on our filter,
     * *but definitely were not* render-blocking based on the timing of their EvaluateScript task.
     * It also computes the set of corresponding CPU node ids that were needed for the paint at the
     * given timestamp.
     */
    static getRenderBlockingNodeData(graph, { cutoffTimestamp, treatNodeAsRenderBlocking, additionalCpuNodesToTreatAsRenderBlocking }) {
        /** A map of blocking script URLs to the earliest EvaluateScript task node that executed them. */
        const scriptUrlToNodeMap = new Map();
        const cpuNodes = [];
        graph.traverse(node => {
            if (node.type === Graph.BaseNode.types.CPU) {
                // A task is *possibly* render-blocking if it *started* before cutoffTimestamp.
                // We use startTime here because the paint event can be *inside* the task that was render-blocking.
                if (node.startTime <= cutoffTimestamp) {
                    cpuNodes.push(node);
                }
                // Build our script URL map to find the earliest EvaluateScript task node.
                const scriptUrls = node.getEvaluateScriptURLs();
                for (const url of scriptUrls) {
                    // Use the earliest CPU node we find.
                    const existing = scriptUrlToNodeMap.get(url) || node;
                    scriptUrlToNodeMap.set(url, node.startTime < existing.startTime ? node : existing);
                }
            }
        });
        cpuNodes.sort((a, b) => a.startTime - b.startTime);
        // A script is *possibly* render-blocking if it finished loading before cutoffTimestamp.
        const possiblyRenderBlockingScriptUrls = Metric.getScriptUrls(graph, node => {
            // The optimistic LCP treatNodeAsRenderBlocking fn wants to exclude some images in the graph,
            // but here it only receives scripts to evaluate. It's a no-op in this case, but it will
            // matter below in the getFirstPaintBasedGraph clone operation.
            return node.endTime <= cutoffTimestamp && treatNodeAsRenderBlocking(node);
        });
        // A script is *definitely not* render-blocking if its EvaluateScript task started after cutoffTimestamp.
        const definitelyNotRenderBlockingScriptUrls = new Set();
        const renderBlockingCpuNodeIds = new Set();
        for (const url of possiblyRenderBlockingScriptUrls) {
            // Lookup the CPU node that had the earliest EvaluateScript for this URL.
            const cpuNodeForUrl = scriptUrlToNodeMap.get(url);
            // If we can't find it at all, we can't conclude anything, so just skip it.
            if (!cpuNodeForUrl) {
                continue;
            }
            // If we found it and it was in our `cpuNodes` set that means it finished before cutoffTimestamp, so it really is render-blocking.
            if (cpuNodes.includes(cpuNodeForUrl)) {
                renderBlockingCpuNodeIds.add(cpuNodeForUrl.id);
                continue;
            }
            // We couldn't find the evaluate script in the set of CPU nodes that ran before our paint, so
            // it must not have been necessary for the paint.
            definitelyNotRenderBlockingScriptUrls.add(url);
        }
        // The first layout, first paint, and first ParseHTML are almost always necessary for first paint,
        // so we always include those CPU nodes.
        const firstLayout = cpuNodes.find(node => node.didPerformLayout());
        if (firstLayout) {
            renderBlockingCpuNodeIds.add(firstLayout.id);
        }
        const firstPaint = cpuNodes.find(node => node.childEvents.some(e => e.name === 'Paint'));
        if (firstPaint) {
            renderBlockingCpuNodeIds.add(firstPaint.id);
        }
        const firstParse = cpuNodes.find(node => node.childEvents.some(e => e.name === 'ParseHTML'));
        if (firstParse) {
            renderBlockingCpuNodeIds.add(firstParse.id);
        }
        // If a CPU filter was passed in, we also want to include those extra nodes.
        if (additionalCpuNodesToTreatAsRenderBlocking) {
            cpuNodes.filter(additionalCpuNodesToTreatAsRenderBlocking).forEach(node => renderBlockingCpuNodeIds.add(node.id));
        }
        return {
            definitelyNotRenderBlockingScriptUrls,
            renderBlockingCpuNodeIds,
        };
    }
    /**
     * Computes the graph required for the first paint of interest.
     */
    static getFirstPaintBasedGraph(dependencyGraph, { cutoffTimestamp, treatNodeAsRenderBlocking, additionalCpuNodesToTreatAsRenderBlocking }) {
        const rbData = this.getRenderBlockingNodeData(dependencyGraph, {
            cutoffTimestamp,
            treatNodeAsRenderBlocking,
            additionalCpuNodesToTreatAsRenderBlocking,
        });
        const { definitelyNotRenderBlockingScriptUrls, renderBlockingCpuNodeIds } = rbData;
        return dependencyGraph.cloneWithRelationships(node => {
            if (node.type === Graph.BaseNode.types.NETWORK) {
                // Exclude all nodes that ended after cutoffTimestamp (except for the main document which we always consider necessary)
                // endTime is negative if request does not finish, make sure startTime isn't after cutoffTimestamp in this case.
                const endedAfterPaint = node.endTime > cutoffTimestamp || node.startTime > cutoffTimestamp;
                if (endedAfterPaint && !node.isMainDocument()) {
                    return false;
                }
                const url = node.request.url;
                // If the URL definitely wasn't render-blocking then we filter it out.
                if (definitelyNotRenderBlockingScriptUrls.has(url)) {
                    return false;
                }
                // Lastly, build up the FCP graph of all nodes we consider render-blocking
                return treatNodeAsRenderBlocking(node);
            }
            // If it's a CPU node, just check if it was blocking.
            return renderBlockingCpuNodeIds.has(node.id);
        });
    }
    static getOptimisticGraph(dependencyGraph, processedNavigation) {
        return this.getFirstPaintBasedGraph(dependencyGraph, {
            cutoffTimestamp: processedNavigation.timestamps.firstContentfulPaint,
            // In the optimistic graph we exclude resources that appeared to be render-blocking but were
            // initiated by a script. While they typically have a very high importance and tend to have a
            // significant impact on the page's content, these resources don't technically block rendering.
            treatNodeAsRenderBlocking: node => node.hasRenderBlockingPriority() && node.initiatorType !== 'script',
        });
    }
    static getPessimisticGraph(dependencyGraph, processedNavigation) {
        return this.getFirstPaintBasedGraph(dependencyGraph, {
            cutoffTimestamp: processedNavigation.timestamps.firstContentfulPaint,
            treatNodeAsRenderBlocking: node => node.hasRenderBlockingPriority(),
        });
    }
}
export { FirstContentfulPaint };
//# sourceMappingURL=FirstContentfulPaint.js.map