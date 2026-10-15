// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Core from '../core/core.js';
import * as Graph from '../graph/graph.js';
import { Metric, } from './Metric.js';
const mobileSlow4GRtt = 150;
class SpeedIndex extends Metric {
    static get coefficients() {
        return {
            // Note that the optimistic estimate is based on the real observed speed index rather than a
            // real lantern graph (and the final estimate will be Math.max(FCP, Speed Index)).
            intercept: 0,
            optimistic: 1.4,
            pessimistic: 0.4,
        };
    }
    static getScaledCoefficients(rttMs) {
        // We want to scale our default coefficients based on the speed of the connection.
        // We will linearly interpolate coefficients for the passed-in rttMs based on two pre-determined points:
        //   1. Baseline point of 30 ms RTT where Speed Index should be a ~50/50 blend of optimistic/pessimistic.
        //      30 ms was based on a typical home WiFi connection's actual RTT.
        //      Coefficients here follow from the fact that the optimistic estimate should be very close
        //      to reality at this connection speed and the pessimistic estimate compensates for minor
        //      connection speed differences.
        //   2. Default throttled point of 150 ms RTT where the default coefficients have been determined to be most accurate.
        //      Coefficients here were determined through thorough analysis and linear regression on the
        //      lantern test data set. See core/scripts/test-lantern.sh for more detail.
        // While the coefficients haven't been analyzed at the interpolated points, it's our current best effort.
        const defaultCoefficients = this.coefficients;
        const defaultRttExcess = mobileSlow4GRtt - 30;
        const multiplier = Math.max((rttMs - 30) / defaultRttExcess, 0);
        return {
            intercept: defaultCoefficients.intercept * multiplier,
            optimistic: 0.5 + (defaultCoefficients.optimistic - 0.5) * multiplier,
            pessimistic: 0.5 + (defaultCoefficients.pessimistic - 0.5) * multiplier,
        };
    }
    static getOptimisticGraph(dependencyGraph) {
        return dependencyGraph;
    }
    static getPessimisticGraph(dependencyGraph) {
        return dependencyGraph;
    }
    static getEstimateFromSimulation(simulationResult, extras) {
        if (!extras.fcpResult) {
            throw new Core.LanternError('missing fcpResult');
        }
        if (extras.observedSpeedIndex === undefined) {
            throw new Core.LanternError('missing observedSpeedIndex');
        }
        const fcpTimeInMs = extras.fcpResult.pessimisticEstimate.timeInMs;
        const estimate = extras.optimistic ?
            extras.observedSpeedIndex :
            SpeedIndex.computeLayoutBasedSpeedIndex(simulationResult.nodeTimings, fcpTimeInMs);
        return {
            timeInMs: estimate,
            nodeTimings: simulationResult.nodeTimings,
        };
    }
    static compute(data, extras) {
        const fcpResult = extras?.fcpResult;
        if (!fcpResult) {
            throw new Core.LanternError('FCP is required to calculate the SpeedIndex metric');
        }
        const metricResult = super.compute(data, extras);
        metricResult.timing = Math.max(metricResult.timing, fcpResult.timing);
        return metricResult;
    }
    /**
     * Approximate speed index using layout events from the simulated node timings.
     * The layout-based speed index is the weighted average of the endTime of CPU nodes that contained
     * a 'Layout' task. log(duration) is used as the weight to stand for "significance" to the page.
     *
     * If no layout events can be found or the endTime of a CPU task is too early, FCP is used instead.
     *
     * This approach was determined after evaluating the accuracy/complexity tradeoff of many
     * different methods. Read more in the evaluation doc.
     *
     * @see https://docs.google.com/document/d/1qJWXwxoyVLVadezIp_Tgdk867G3tDNkkVRvUJSH3K1E/edit#
     */
    static computeLayoutBasedSpeedIndex(nodeTimings, fcpTimeInMs) {
        const layoutWeights = [];
        for (const [node, timing] of nodeTimings.entries()) {
            if (node.type !== Graph.BaseNode.types.CPU) {
                continue;
            }
            if (node.childEvents.some(x => x.name === 'Layout')) {
                const timingWeight = Math.max(Math.log2(timing.endTime - timing.startTime), 0);
                layoutWeights.push({ time: timing.endTime, weight: timingWeight });
            }
        }
        const totalWeightedTime = layoutWeights.map(evt => evt.weight * Math.max(evt.time, fcpTimeInMs)).reduce((a, b) => a + b, 0);
        const totalWeight = layoutWeights.map(evt => evt.weight).reduce((a, b) => a + b, 0);
        if (!totalWeight) {
            return fcpTimeInMs;
        }
        return totalWeightedTime / totalWeight;
    }
}
export { SpeedIndex };
//# sourceMappingURL=SpeedIndex.js.map