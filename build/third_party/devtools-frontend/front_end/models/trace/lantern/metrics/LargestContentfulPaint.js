// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Core from '../core/core.js';
import { FirstContentfulPaint } from './FirstContentfulPaint.js';
import { Metric, } from './Metric.js';
class LargestContentfulPaint extends Metric {
    static get coefficients() {
        return {
            intercept: 0,
            optimistic: 0.5,
            pessimistic: 0.5,
        };
    }
    /**
     * Low priority image nodes are usually offscreen and very unlikely to be the
     * resource that is required for LCP. Our LCP graphs include everything except for these images.
     */
    static isNotLowPriorityImageNode(node) {
        if (node.type !== 'network') {
            return true;
        }
        const isImage = node.request.resourceType === 'Image';
        const isLowPriority = node.request.priority === 'Low' || node.request.priority === 'VeryLow';
        return !isImage || !isLowPriority;
    }
    static getOptimisticGraph(dependencyGraph, processedNavigation) {
        const { firstContentfulPaint: fcp, largestContentfulPaint: lcp } = processedNavigation.timestamps;
        if (!lcp) {
            throw new Core.LanternError('NO_LCP');
        }
        if (fcp === lcp && processedNavigation.largestContentfulPaintEvt?.args?.data?.type === 'text') {
            return FirstContentfulPaint.getOptimisticGraph(dependencyGraph, processedNavigation);
        }
        return FirstContentfulPaint.getFirstPaintBasedGraph(dependencyGraph, {
            cutoffTimestamp: lcp,
            treatNodeAsRenderBlocking: LargestContentfulPaint.isNotLowPriorityImageNode,
        });
    }
    static getPessimisticGraph(dependencyGraph, processedNavigation) {
        const { firstContentfulPaint: fcp, largestContentfulPaint: lcp } = processedNavigation.timestamps;
        if (!lcp) {
            throw new Core.LanternError('NO_LCP');
        }
        if (fcp === lcp && processedNavigation.largestContentfulPaintEvt?.args?.data?.type === 'text') {
            return FirstContentfulPaint.getPessimisticGraph(dependencyGraph, processedNavigation);
        }
        return FirstContentfulPaint.getFirstPaintBasedGraph(dependencyGraph, {
            cutoffTimestamp: lcp,
            treatNodeAsRenderBlocking: _ => true,
            // For pessimistic LCP we'll include *all* layout nodes
            additionalCpuNodesToTreatAsRenderBlocking: node => node.didPerformLayout(),
        });
    }
    static getEstimateFromSimulation(simulationResult) {
        const nodeTimesNotOffscreenImages = Array.from(simulationResult.nodeTimings.entries())
            .filter(entry => LargestContentfulPaint.isNotLowPriorityImageNode(entry[0]))
            .map(entry => entry[1].endTime);
        return {
            timeInMs: Math.max(...nodeTimesNotOffscreenImages),
            nodeTimings: simulationResult.nodeTimings,
        };
    }
    static compute(data, extras) {
        const fcpResult = extras?.fcpResult;
        if (!fcpResult) {
            throw new Core.LanternError('FCP is required to calculate the LCP metric');
        }
        const metricResult = super.compute(data, extras);
        metricResult.timing = Math.max(metricResult.timing, fcpResult.timing);
        return metricResult;
    }
}
export { LargestContentfulPaint };
//# sourceMappingURL=LargestContentfulPaint.js.map