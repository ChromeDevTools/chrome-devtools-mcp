// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as metaHandlerData } from './MetaHandler.js';
import { ScoreClassification } from './PageLoadMetricsHandler.js';
import { data as screenshotsHandlerData } from './ScreenshotsHandler.js';
/**
 * This represents the maximum #time we will allow a cluster to go before we
 * reset it.
 **/
export const MAX_CLUSTER_DURATION = Helpers.Timing.milliToMicro(Types.Timing.Milli(5000));
/**
 * This represents the maximum #time we will allow between layout shift events
 * before considering it to be the start of a new cluster.
 **/
export const MAX_SHIFT_TIME_DELTA = Helpers.Timing.milliToMicro(Types.Timing.Milli(1000));
// Layout shifts are reported globally to the developer, irrespective of which
// frame they originated in. However, each process does have its own individual
// CLS score, so we need to segment by process. This means Layout Shifts from
// sites with one process (no subframes, or subframes from the same origin)
// will be reported together. In the case of multiple renderers (frames across
// different origins), we offer the developer the ability to switch renderer in
// the UI.
let layoutShiftEvents = [];
// These events denote potential node resizings. We store them to link captured
// layout shifts to the resizing of unsized elements.
let layoutInvalidationEvents = [];
let scheduleStyleInvalidationEvents = [];
let styleRecalcInvalidationEvents = [];
let renderFrameImplCreateChildFrameEvents = [];
let domLoadingEvents = [];
let layoutImageUnsizedEvents = [];
let remoteFonts = [];
let backendNodeIds = new Set();
// Layout shifts happen during PrePaint as part of the rendering lifecycle.
// We determine if a LayoutInvalidation event is a potential root cause of a layout
// shift if the next PrePaint after the LayoutInvalidation is the parent
// node of such shift.
let prePaintEvents = [];
let paintImageEvents = [];
let sessionMaxScore = 0;
let clsWindowID = -1;
let clusters = [];
// The complete timeline of LS score changes in a trace.
// Includes drops to 0 when session windows end.
let scoreRecords = [];
export function reset() {
    layoutShiftEvents = [];
    layoutInvalidationEvents = [];
    scheduleStyleInvalidationEvents = [];
    styleRecalcInvalidationEvents = [];
    prePaintEvents = [];
    paintImageEvents = [];
    renderFrameImplCreateChildFrameEvents = [];
    layoutImageUnsizedEvents = [];
    domLoadingEvents = [];
    remoteFonts = [];
    backendNodeIds = new Set();
    clusters = [];
    sessionMaxScore = 0;
    scoreRecords = [];
    clsWindowID = -1;
}
let enableSoftNavigation = true;
export function handleUserConfig(userConfig) {
    enableSoftNavigation = userConfig.enableSoftNavigation;
}
export function handleEvent(event) {
    if (Types.Events.isLayoutShift(event) && !event.args.data?.had_recent_input) {
        layoutShiftEvents.push(event);
        return;
    }
    if (Types.Events.isLayoutInvalidationTracking(event)) {
        layoutInvalidationEvents.push(event);
        return;
    }
    if (Types.Events.isScheduleStyleInvalidationTracking(event)) {
        scheduleStyleInvalidationEvents.push(event);
    }
    if (Types.Events.isStyleRecalcInvalidationTracking(event)) {
        styleRecalcInvalidationEvents.push(event);
    }
    if (Types.Events.isPrePaint(event)) {
        prePaintEvents.push(event);
        return;
    }
    if (Types.Events.isRenderFrameImplCreateChildFrame(event)) {
        renderFrameImplCreateChildFrameEvents.push(event);
    }
    if (Types.Events.isDomLoading(event)) {
        domLoadingEvents.push(event);
    }
    if (Types.Events.isLayoutImageUnsized(event)) {
        layoutImageUnsizedEvents.push(event);
    }
    if (Types.Events.isBeginRemoteFontLoad(event)) {
        remoteFonts.push({
            display: event.args.display,
            url: event.args.url,
            beginRemoteFontLoadEvent: event,
        });
    }
    if (Types.Events.isRemoteFontLoaded(event)) {
        for (const remoteFont of remoteFonts) {
            if (remoteFont.url === event.args.url) {
                remoteFont.name = event.args.name;
            }
        }
    }
    if (Types.Events.isPaintImage(event)) {
        paintImageEvents.push(event);
    }
}
function traceWindowFromTime(time) {
    return {
        min: time,
        max: time,
        range: Types.Timing.Micro(0),
    };
}
function updateTraceWindowMax(traceWindow, newMax) {
    traceWindow.max = newMax;
    traceWindow.range = Types.Timing.Micro(traceWindow.max - traceWindow.min);
}
function findScreenshots(timestamp) {
    const data = screenshotsHandlerData();
    if (data.screenshots) {
        const before = Helpers.Trace.findPreviousEventBeforeTimestamp(data.screenshots, timestamp);
        const after = before ? data.screenshots[data.screenshots.indexOf(before) + 1] : null;
        return { before, after };
    }
    if (data.legacySyntheticScreenshots) {
        const before = Helpers.Trace.findPreviousEventBeforeTimestamp(data.legacySyntheticScreenshots, timestamp);
        const after = before ? data.legacySyntheticScreenshots[data.legacySyntheticScreenshots.indexOf(before) + 1] : null;
        return { before, after };
    }
    // No screenshots
    return { before: null, after: null };
}
function buildScoreRecords() {
    const { traceBounds } = metaHandlerData();
    scoreRecords.push({ ts: traceBounds.min, score: 0 });
    for (const cluster of clusters) {
        let clusterScore = 0;
        if (cluster.events[0].args.data) {
            scoreRecords.push({ ts: cluster.clusterWindow.min, score: cluster.events[0].args.data.weighted_score_delta });
        }
        for (let i = 0; i < cluster.events.length; i++) {
            const event = cluster.events[i];
            if (!event.args.data) {
                continue;
            }
            clusterScore += event.args.data.weighted_score_delta;
            scoreRecords.push({ ts: event.ts, score: clusterScore });
        }
        scoreRecords.push({ ts: cluster.clusterWindow.max, score: 0 });
    }
}
/**
 * Collects backend node ids coming from LayoutShift and LayoutInvalidation
 * events.
 */
function collectNodes() {
    backendNodeIds.clear();
    // Collect the node ids present in the shifts.
    for (const layoutShift of layoutShiftEvents) {
        if (!layoutShift.args.data?.impacted_nodes) {
            continue;
        }
        for (const node of layoutShift.args.data.impacted_nodes) {
            backendNodeIds.add(node.node_id);
        }
    }
    // Collect the node ids present in LayoutInvalidation & scheduleStyleInvalidation events.
    for (const layoutInvalidation of layoutInvalidationEvents) {
        if (!layoutInvalidation.args.data?.nodeId) {
            continue;
        }
        backendNodeIds.add(layoutInvalidation.args.data.nodeId);
    }
    for (const scheduleStyleInvalidation of scheduleStyleInvalidationEvents) {
        if (!scheduleStyleInvalidation.args.data?.nodeId) {
            continue;
        }
        backendNodeIds.add(scheduleStyleInvalidation.args.data.nodeId);
    }
}
export async function finalize() {
    // Ensure the events are sorted by #time ascending.
    layoutShiftEvents.sort((a, b) => a.ts - b.ts);
    prePaintEvents.sort((a, b) => a.ts - b.ts);
    layoutInvalidationEvents.sort((a, b) => a.ts - b.ts);
    renderFrameImplCreateChildFrameEvents.sort((a, b) => a.ts - b.ts);
    domLoadingEvents.sort((a, b) => a.ts - b.ts);
    layoutImageUnsizedEvents.sort((a, b) => a.ts - b.ts);
    remoteFonts.sort((a, b) => a.beginRemoteFontLoadEvent.ts - b.beginRemoteFontLoadEvent.ts);
    paintImageEvents.sort((a, b) => a.ts - b.ts);
    // Each function transforms the data used by the next, as such the invoke order
    // is important.
    await buildLayoutShiftsClusters();
    buildScoreRecords();
    collectNodes();
}
async function buildLayoutShiftsClusters() {
    const { navigationsByFrameId, mainFrameId, traceBounds, softNavigationsById } = metaHandlerData();
    const softNavigations = enableSoftNavigation ? Array.from(softNavigationsById.values()) : [];
    const navigations = [...(navigationsByFrameId.get(mainFrameId) || []), ...softNavigations].sort((a, b) => a.ts - b.ts);
    if (layoutShiftEvents.length === 0) {
        return;
    }
    let firstShiftTime = layoutShiftEvents[0].ts;
    let lastShiftTime = layoutShiftEvents[0].ts;
    let lastShiftNavigation = null;
    // Now step through each and create clusters.
    // A cluster is equivalent to a session window (see https://web.dev/cls/#what-is-cls).
    // To make the line chart clear, we explicitly demark the limits of each session window
    // by starting the cumulative score of the window at the time of the first layout shift
    // and ending it (dropping the line back to 0) when the window ends according to the
    // thresholds (MAX_CLUSTER_DURATION, MAX_SHIFT_TIME_DELTA).
    for (const event of layoutShiftEvents) {
        // First detect if either the cluster duration or the #time between this and
        // the last shift has been exceeded.
        const clusterDurationExceeded = event.ts - firstShiftTime > MAX_CLUSTER_DURATION;
        const maxTimeDeltaSinceLastShiftExceeded = event.ts - lastShiftTime > MAX_SHIFT_TIME_DELTA;
        // Next take a look at navigations. If between this and the last shift we have navigated,
        // note it.
        const currentShiftNavigation = Platform.ArrayUtilities.nearestIndexFromEnd(navigations, nav => nav.ts < event.ts);
        const hasNavigated = lastShiftNavigation !== currentShiftNavigation && currentShiftNavigation !== null;
        // If any of the above criteria are met or if we don't have any cluster yet we should
        // start a new one.
        if (clusterDurationExceeded || maxTimeDeltaSinceLastShiftExceeded || hasNavigated || !clusters.length) {
            // The cluster starts #time should be the timestamp of the first layout shift in it.
            const clusterStartTime = event.ts;
            // If the last session window ended because the max delta time between shifts
            // was exceeded set the endtime to MAX_SHIFT_TIME_DELTA microseconds after the
            // last shift in the session.
            const endTimeByMaxSessionDuration = clusterDurationExceeded ? firstShiftTime + MAX_CLUSTER_DURATION : Infinity;
            // If the last session window ended because the max session duration was
            // surpassed, set the endtime so that the window length = MAX_CLUSTER_DURATION;
            const endTimeByMaxShiftGap = maxTimeDeltaSinceLastShiftExceeded ? lastShiftTime + MAX_SHIFT_TIME_DELTA : Infinity;
            // If there was a navigation during the last window, close it at the time
            // of the navigation.
            const endTimeByNavigation = hasNavigated ? navigations[currentShiftNavigation].ts : Infinity;
            // End the previous cluster at the time of the first of the criteria above that was met.
            const previousClusterEndTime = Math.min(endTimeByMaxSessionDuration, endTimeByMaxShiftGap, endTimeByNavigation);
            // If there is an existing cluster update its closing time.
            if (clusters.length > 0) {
                const currentCluster = clusters[clusters.length - 1];
                updateTraceWindowMax(currentCluster.clusterWindow, Types.Timing.Micro(previousClusterEndTime));
            }
            // If this cluster happened after a navigation, set the navigationId to
            // the current navigation. This lets us easily group clusters by
            // navigation.
            let navigationId = undefined;
            if (currentShiftNavigation !== null) {
                const nav = navigations[currentShiftNavigation];
                if (Types.Events.isNavigationStart(nav)) {
                    navigationId = nav.args.data?.navigationId;
                }
            }
            else {
                navigationId = Types.Events.NO_NAVIGATION;
            }
            clusters.push(Helpers.SyntheticEvents.SyntheticEventsManager
                .registerSyntheticEvent({
                name: 'SyntheticLayoutShiftCluster',
                // Will be replaced by the worst layout shift in the next for loop.
                rawSourceEvent: event,
                events: [],
                clusterWindow: traceWindowFromTime(clusterStartTime),
                clusterCumulativeScore: 0,
                scoreWindows: {
                    good: traceWindowFromTime(clusterStartTime),
                },
                navigationId,
                // Set default Event so that this event is treated accordingly for the track appender.
                ts: event.ts,
                pid: event.pid,
                tid: event.tid,
                ph: Types.Events.Phase.COMPLETE,
                cat: '',
                dur: Types.Timing.Micro(-1), // This `cluster.dur` is updated below.
            }));
            firstShiftTime = clusterStartTime;
        }
        // Given the above we should have a cluster available, so pick the most
        // recent one and append the shift, bump its score and window values accordingly.
        const currentCluster = clusters[clusters.length - 1];
        const timeFromNavigation = currentShiftNavigation !== null ?
            Types.Timing.Micro(event.ts - navigations[currentShiftNavigation].ts) :
            undefined;
        currentCluster.clusterCumulativeScore += event.args.data ? event.args.data.weighted_score_delta : 0;
        if (!event.args.data) {
            continue;
        }
        const shift = Helpers.SyntheticEvents.SyntheticEventsManager.registerSyntheticEvent({
            rawSourceEvent: event,
            ...event,
            name: Types.Events.Name.SYNTHETIC_LAYOUT_SHIFT,
            args: {
                frame: event.args.frame,
                data: {
                    ...event.args.data,
                    rawEvent: event,
                    navigationId: currentCluster.navigationId ?? undefined,
                },
            },
            parsedData: {
                timeFromNavigation,
                screenshots: findScreenshots(event.ts),
                cumulativeWeightedScoreInWindow: currentCluster.clusterCumulativeScore,
                // The score of the session window is temporarily set to 0 just
                // to initialize it. Since we need to get the score of all shifts
                // in the session window to determine its value, its definite
                // value is set when stepping through the built clusters.
                sessionWindowData: { cumulativeWindowScore: 0, id: clusters.length },
            },
        });
        currentCluster.events.push(shift);
        updateTraceWindowMax(currentCluster.clusterWindow, event.ts);
        lastShiftTime = event.ts;
        lastShiftNavigation = currentShiftNavigation;
    }
    // Now step through each cluster and set up the times at which the value
    // goes from Good, to needs improvement, to Bad. Note that if there is a
    // large jump we may go from Good to Bad without ever creating a Needs
    // Improvement window at all.
    for (const cluster of clusters) {
        let weightedScore = 0;
        let windowID = -1;
        // If this is the last cluster update its window. The cluster duration is determined
        // by the minimum between: time to next navigation, trace end time, time to maximum
        // cluster duration and time to maximum gap between layout shifts.
        if (cluster === clusters[clusters.length - 1]) {
            const clusterEndByMaxDuration = MAX_CLUSTER_DURATION + cluster.clusterWindow.min;
            const clusterEndByMaxGap = cluster.clusterWindow.max + MAX_SHIFT_TIME_DELTA;
            const nextNavigationIndex = Platform.ArrayUtilities.nearestIndexFromBeginning(navigations, nav => nav.ts > cluster.clusterWindow.max);
            const nextNavigationTime = nextNavigationIndex ? navigations[nextNavigationIndex].ts : Infinity;
            const clusterEnd = Math.min(clusterEndByMaxDuration, clusterEndByMaxGap, traceBounds.max, nextNavigationTime);
            updateTraceWindowMax(cluster.clusterWindow, Types.Timing.Micro(clusterEnd));
        }
        let largestScore = 0;
        let worstShiftEvent = null;
        for (const shift of cluster.events) {
            weightedScore += shift.args.data ? shift.args.data.weighted_score_delta : 0;
            windowID = shift.parsedData.sessionWindowData.id;
            const ts = shift.ts;
            // Update the the CLS score of this shift's session window now that
            // we have it.
            shift.parsedData.sessionWindowData.cumulativeWindowScore = cluster.clusterCumulativeScore;
            if (weightedScore < LayoutShiftsThreshold.NEEDS_IMPROVEMENT) {
                // Expand the Good window.
                updateTraceWindowMax(cluster.scoreWindows.good, ts);
            }
            else if (weightedScore >= LayoutShiftsThreshold.NEEDS_IMPROVEMENT && weightedScore < LayoutShiftsThreshold.BAD) {
                if (!cluster.scoreWindows.needsImprovement) {
                    // Close the Good window, and open the needs improvement window.
                    updateTraceWindowMax(cluster.scoreWindows.good, Types.Timing.Micro(ts - 1));
                    cluster.scoreWindows.needsImprovement = traceWindowFromTime(ts);
                }
                // Expand the needs improvement window.
                updateTraceWindowMax(cluster.scoreWindows.needsImprovement, ts);
            }
            else if (weightedScore >= LayoutShiftsThreshold.BAD) {
                if (!cluster.scoreWindows.bad) {
                    // We may jump from Good to Bad here, so update whichever window is open.
                    if (cluster.scoreWindows.needsImprovement) {
                        updateTraceWindowMax(cluster.scoreWindows.needsImprovement, Types.Timing.Micro(ts - 1));
                    }
                    else {
                        updateTraceWindowMax(cluster.scoreWindows.good, Types.Timing.Micro(ts - 1));
                    }
                    cluster.scoreWindows.bad = traceWindowFromTime(shift.ts);
                }
                // Expand the Bad window.
                updateTraceWindowMax(cluster.scoreWindows.bad, ts);
            }
            // At this point the windows are set by the timestamps of the events, but the
            // next cluster begins at the timestamp of its first event. As such we now
            // need to expand the score window to the end of the cluster, and we do so
            // by using the Bad widow if it's there, or the NI window, or finally the
            // Good window.
            if (cluster.scoreWindows.bad) {
                updateTraceWindowMax(cluster.scoreWindows.bad, cluster.clusterWindow.max);
            }
            else if (cluster.scoreWindows.needsImprovement) {
                updateTraceWindowMax(cluster.scoreWindows.needsImprovement, cluster.clusterWindow.max);
            }
            else {
                updateTraceWindowMax(cluster.scoreWindows.good, cluster.clusterWindow.max);
            }
            // Find the worst layout shift of the cluster.
            const score = shift.args.data?.weighted_score_delta;
            if (score !== undefined && score > largestScore) {
                largestScore = score;
                worstShiftEvent = shift;
            }
        }
        // Update the cluster's worst layout shift.
        if (worstShiftEvent) {
            cluster.worstShiftEvent = worstShiftEvent;
            cluster.rawSourceEvent = worstShiftEvent.rawSourceEvent;
        }
        // layout shifts are already sorted by time ascending.
        // Capture the time range of the cluster.
        cluster.ts = cluster.events[0].ts;
        const lastShiftTimings = Helpers.Timing.eventTimingsMicroSeconds(cluster.events[cluster.events.length - 1]);
        // Add MAX_SHIFT_TIME_DELTA, the section gap after the last layout shift. This marks the end of the cluster.
        cluster.dur = Types.Timing.Micro((lastShiftTimings.endTime - cluster.events[0].ts) + MAX_SHIFT_TIME_DELTA);
        if (weightedScore > sessionMaxScore) {
            clsWindowID = windowID;
            sessionMaxScore = weightedScore;
        }
    }
}
export function data() {
    return {
        clusters,
        sessionMaxScore,
        clsWindowID,
        prePaintEvents,
        layoutInvalidationEvents,
        scheduleStyleInvalidationEvents,
        styleRecalcInvalidationEvents,
        renderFrameImplCreateChildFrameEvents,
        domLoadingEvents,
        layoutImageUnsizedEvents,
        remoteFonts,
        scoreRecords,
        backendNodeIds,
        paintImageEvents,
    };
}
export function deps() {
    return ['Screenshots', 'Meta'];
}
export function scoreClassificationForLayoutShift(score) {
    let state = ScoreClassification.GOOD;
    if (score >= LayoutShiftsThreshold.NEEDS_IMPROVEMENT) {
        state = ScoreClassification.OK;
    }
    if (score >= LayoutShiftsThreshold.BAD) {
        state = ScoreClassification.BAD;
    }
    return state;
}
/** Based on https://web.dev/cls/ **/
export var LayoutShiftsThreshold;
(function (LayoutShiftsThreshold) {
    LayoutShiftsThreshold[LayoutShiftsThreshold["GOOD"] = 0] = "GOOD";
    LayoutShiftsThreshold[LayoutShiftsThreshold["NEEDS_IMPROVEMENT"] = 0.1] = "NEEDS_IMPROVEMENT";
    LayoutShiftsThreshold[LayoutShiftsThreshold["BAD"] = 0.25] = "BAD";
})(LayoutShiftsThreshold || (LayoutShiftsThreshold = {}));
//# sourceMappingURL=LayoutShiftsHandler.js.map