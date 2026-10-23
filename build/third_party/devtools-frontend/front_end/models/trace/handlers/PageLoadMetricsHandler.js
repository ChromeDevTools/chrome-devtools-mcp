// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * This handler stores page load metrics, including web vitals,
 * and exports them in the shape of a map with the following shape:
 * Map(FrameId -> Map(navigation -> metrics) )
 *
 * Includes soft navigations.
 *
 * It also exports all markers in a trace in an array.
 *
 * Some metrics are taken directly from a page load events (AKA markers) like DCL.
 * Others require processing multiple events to be determined, like CLS and TBT.
 */
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as metaHandlerData } from './MetaHandler.js';
/**
 * This represents the metric scores for all navigations, for all frames in a trace.
 * Given a frame id, the map points to another map from navigation id to metric scores.
 * The metric scores include the event related to the metric as well as the data regarding
 * the score itself.
 */
let metricScoresByFrameId = new Map();
/**
 * Page load events with no associated duration that happened in the
 * main frame.
 */
let allMarkerEvents = [];
// Grouped by navigation to make it easier for insights to scope checks.
let metaCharsetCheckEventsByNavigation = new WeakMap();
let metaCharsetCheckEventsArray = [];
export function reset() {
    metricScoresByFrameId = new Map();
    pageLoadEventsArray = [];
    allMarkerEvents = [];
    selectedLCPCandidateEvents = new Set();
    metaCharsetCheckEventsByNavigation = new WeakMap();
    metaCharsetCheckEventsArray = [];
}
let enableSoftNavigation = true;
export function handleUserConfig(userConfig) {
    enableSoftNavigation = userConfig.enableSoftNavigation;
}
let pageLoadEventsArray = [];
// Once we've found the LCP events in the trace we want to fetch their DOM Node
// from the backend. We could do this by parsing through our Map of frame =>
// navigation => metric, but it's easier to keep a set of LCP events. As we
// parse the trace, any time we store an LCP candidate as the potential LCP
// event, we store the event here. If we later find a new candidate in the
// trace, we store that and delete the prior event. When we've parsed the
// entire trace this set will contain all the LCP events that were used - e.g.
// the candidates that were the actual LCP events.
let selectedLCPCandidateEvents = new Set();
export function handleEvent(event) {
    if (Types.Events.isMetaCharsetCheck(event)) {
        metaCharsetCheckEventsArray.push(event);
        return;
    }
    if (!Types.Events.eventIsPageLoadEvent(event)) {
        return;
    }
    if (!enableSoftNavigation &&
        (Types.Events.isSoftNavigationStart(event) ||
            event.name === Types.Events.Name.MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION ||
            Types.Events.isSoftFirstContentfulPaint(event))) {
        return;
    }
    pageLoadEventsArray.push(event);
    // A soft nav entry includes the Soft FCP details but we want to process both
    // so push a separate Soft FCP event
    if (Types.Events.isSoftNavigationStart(event) && event.args?.context?.firstContentfulPaint) {
        const syntheticSoftFcpEvent = Helpers.SyntheticEvents.SyntheticEventsManager
            .registerSyntheticEvent({
            name: Types.Events.Name.MARK_SOFT_FCP,
            ph: Types.Events.Phase.MARK,
            rawSourceEvent: event,
            pid: event.pid,
            tid: event.tid,
            ts: Types.Timing.Micro(event.args.context.firstContentfulPaint),
            cat: event.cat,
            args: {
                frame: event.args.frame,
                context: {
                    ...event.args.context,
                },
            },
        });
        pageLoadEventsArray.push(syntheticSoftFcpEvent);
    }
}
function storePageLoadMetricAgainstNavigationId(navigation, event) {
    const frameId = getFrameIdForPageLoadEvent(event);
    const { rendererProcessesByFrame } = metaHandlerData();
    // If either of these pieces of data do not exist, the most likely
    // explanation is that the page load metric we found is for a frame/process
    // combo that the MetaHandler discarded. This typically happens if we get a
    // navigation event with an empty URL. Therefore, we will silently return and
    // drop this metric. If we didn't care about the navigation, we certainly do
    // not need to care about metrics for that navigation.
    const rendererProcessesInFrame = rendererProcessesByFrame.get(frameId);
    if (!rendererProcessesInFrame) {
        return;
    }
    const processData = rendererProcessesInFrame.get(event.pid);
    if (!processData) {
        return;
    }
    if (Types.Events.isNavigationStart(event)) {
        return;
    }
    if (Types.Events.isAnyFirstContentfulPaint(event)) {
        const fcpTime = Types.Timing.Micro(event.ts - navigation.ts);
        const classification = scoreClassificationForFirstContentfulPaint(fcpTime);
        const metricScore = { event, metricName: MetricName.FCP, classification, navigation, timing: fcpTime };
        storeMetricScore(frameId, navigation, metricScore);
        return;
    }
    if (Types.Events.isFirstPaint(event)) {
        const paintTime = Types.Timing.Micro(event.ts - navigation.ts);
        const classification = ScoreClassification.UNCLASSIFIED;
        const metricScore = { event, metricName: MetricName.FP, classification, navigation, timing: paintTime };
        storeMetricScore(frameId, navigation, metricScore);
        return;
    }
    if (Types.Events.isMarkDOMContent(event)) {
        const dclTime = Types.Timing.Micro(event.ts - navigation.ts);
        const metricScore = {
            event,
            metricName: MetricName.DCL,
            classification: scoreClassificationForDOMContentLoaded(dclTime),
            navigation,
            timing: dclTime,
        };
        storeMetricScore(frameId, navigation, metricScore);
        return;
    }
    if (Types.Events.isInteractiveTime(event)) {
        const ttiValue = Types.Timing.Micro(event.ts - navigation.ts);
        const tti = {
            event,
            metricName: MetricName.TTI,
            classification: scoreClassificationForTimeToInteractive(ttiValue),
            navigation,
            timing: ttiValue,
        };
        storeMetricScore(frameId, navigation, tti);
        const tbtValue = Helpers.Timing.milliToMicro(Types.Timing.Milli(event.args.args.total_blocking_time_ms));
        const tbt = {
            event,
            metricName: MetricName.TBT,
            classification: scoreClassificationForTotalBlockingTime(tbtValue),
            navigation,
            timing: tbtValue,
        };
        storeMetricScore(frameId, navigation, tbt);
        return;
    }
    if (Types.Events.isMarkLoad(event)) {
        const loadTime = Types.Timing.Micro(event.ts - navigation.ts);
        const metricScore = {
            event,
            metricName: MetricName.L,
            classification: ScoreClassification.UNCLASSIFIED,
            navigation,
            timing: loadTime,
        };
        storeMetricScore(frameId, navigation, metricScore);
        return;
    }
    if (Types.Events.isAnyLargestContentfulPaintCandidate(event)) {
        const candidateIndex = event.args.data?.candidateIndex;
        if (!candidateIndex) {
            throw new Error('Largest Contentful Paint unexpectedly had no candidateIndex.');
        }
        const lcpTime = Types.Timing.Micro(event.ts - navigation.ts);
        const lcp = {
            event,
            metricName: MetricName.LCP,
            classification: scoreClassificationForLargestContentfulPaint(lcpTime),
            navigation,
            timing: lcpTime,
        };
        const metricsByNavigation = Platform.MapUtilities.getWithDefault(metricScoresByFrameId, frameId, () => new Map());
        const metrics = Platform.MapUtilities.getWithDefault(metricsByNavigation, navigation, () => new Map());
        const lastLCPCandidate = metrics.get(MetricName.LCP);
        if (lastLCPCandidate === undefined) {
            selectedLCPCandidateEvents.add(lcp.event);
            storeMetricScore(frameId, navigation, lcp);
            return;
        }
        const lastLCPCandidateEvent = lastLCPCandidate.event;
        if (!Types.Events.isAnyLargestContentfulPaintCandidate(lastLCPCandidateEvent)) {
            return;
        }
        const lastCandidateIndex = lastLCPCandidateEvent.args.data?.candidateIndex;
        if (!lastCandidateIndex) {
            // lastCandidateIndex cannot be undefined because we don't store candidates with
            // with an undefined candidateIndex value. This check is only to make TypeScript
            // treat the field as not undefined below.
            return;
        }
        if (lastCandidateIndex < candidateIndex) {
            selectedLCPCandidateEvents.delete(lastLCPCandidateEvent);
            selectedLCPCandidateEvents.add(lcp.event);
            storeMetricScore(frameId, navigation, lcp);
        }
        return;
    }
    if (Types.Events.isLayoutShift(event)) {
        return;
    }
    if (Types.Events.isSoftNavigationStart(event)) {
        return;
    }
    return Platform.assertNever(event, `Unexpected event type: ${event}`);
}
function storeMetricScore(frameId, navigation, metricScore) {
    const metricsByNavigation = Platform.MapUtilities.getWithDefault(metricScoresByFrameId, frameId, () => new Map());
    const metrics = Platform.MapUtilities.getWithDefault(metricsByNavigation, navigation, () => new Map());
    // If an entry with that metric name is present, delete it so that the new entry that
    // will replace it is added at the end of the map. This way we guarantee the map entries
    // are ordered in ASC manner by timestamp.
    metrics.delete(metricScore.metricName);
    metrics.set(metricScore.metricName, metricScore);
}
export function getFrameIdForPageLoadEvent(event) {
    if (Types.Events.isAnyFirstContentfulPaint(event) || Types.Events.isInteractiveTime(event) ||
        Types.Events.isAnyLargestContentfulPaintCandidate(event) || Types.Events.isNavigationStart(event) ||
        Types.Events.isSoftNavigationStart(event) || Types.Events.isLayoutShift(event) ||
        Types.Events.isFirstPaint(event)) {
        return event.args.frame;
    }
    if (Types.Events.isMarkDOMContent(event) || Types.Events.isMarkLoad(event)) {
        const frameId = event.args.data?.frame;
        if (!frameId) {
            throw new Error('MarkDOMContent unexpectedly had no frame ID.');
        }
        return frameId;
    }
    Platform.assertNever(event, `Unexpected event type: ${event}`);
}
function getNavigationForPageLoadEvent(event) {
    if (Types.Events.isAnyFirstContentfulPaint(event) || Types.Events.isAnyLargestContentfulPaintCandidate(event) ||
        Types.Events.isFirstPaint(event)) {
        const { navigationsByNavigationId, softNavigationsById } = metaHandlerData();
        let navigation;
        if (Types.Events.isSoftLargestContentfulPaintCandidate(event)) {
            const navigationId = event.args.data?.performanceTimelineNavigationId;
            navigation = navigationId ? softNavigationsById.get(navigationId) : undefined;
            if (!navigation) {
                // The most recent soft navigation must have been before the trace started.
                return null;
            }
        }
        else if (Types.Events.isSoftFirstContentfulPaint(event)) {
            const navigationId = event.args.context?.performanceTimelineNavigationId;
            navigation = navigationId ? softNavigationsById.get(navigationId) : undefined;
            if (!navigation) {
                // The most recent soft navigation must have been before the trace started.
                return null;
            }
        }
        else {
            const navigationId = event.args.data?.navigationId;
            if (!navigationId) {
                throw new Error(`Trace event unexpectedly had no navigation ID: ${JSON.stringify(event, null, 2)}`);
            }
            navigation = navigationsByNavigationId.get(navigationId);
        }
        if (!navigation) {
            // This event's navigation has been filtered out by the meta handler as a noise event.
            return null;
        }
        return navigation;
    }
    if (Types.Events.isSoftNavigationStart(event)) {
        const { softNavigationsById } = metaHandlerData();
        return softNavigationsById.get(event.args.context.performanceTimelineNavigationId) ?? null;
    }
    if (Types.Events.isMarkDOMContent(event) || Types.Events.isInteractiveTime(event) ||
        Types.Events.isLayoutShift(event) || Types.Events.isMarkLoad(event)) {
        const frameId = getFrameIdForPageLoadEvent(event);
        const { navigationsByFrameId } = metaHandlerData();
        return Helpers.Trace.getNavigationForTraceEvent(event, frameId, navigationsByFrameId);
    }
    if (Types.Events.isNavigationStart(event)) {
        // We don't want to compute metrics of the navigation relative to itself, so we'll avoid avoid all that.
        return null;
    }
    return Platform.assertNever(event, `Unexpected event type: ${event}`);
}
/**
 * Classifications sourced from
 * https://web.dev/fcp/
 */
export function scoreClassificationForFirstContentfulPaint(fcpScoreInMicroseconds) {
    const FCP_GOOD_TIMING = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(1.8));
    const FCP_MEDIUM_TIMING = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(3.0));
    let scoreClassification = ScoreClassification.BAD;
    if (fcpScoreInMicroseconds <= FCP_MEDIUM_TIMING) {
        scoreClassification = ScoreClassification.OK;
    }
    if (fcpScoreInMicroseconds <= FCP_GOOD_TIMING) {
        scoreClassification = ScoreClassification.GOOD;
    }
    return scoreClassification;
}
/**
 * Classifications sourced from
 * https://web.dev/interactive/#how-lighthouse-determines-your-tti-score
 */
export function scoreClassificationForTimeToInteractive(ttiTimeInMicroseconds) {
    const TTI_GOOD_TIMING = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(3.8));
    const TTI_MEDIUM_TIMING = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(7.3));
    let scoreClassification = ScoreClassification.BAD;
    if (ttiTimeInMicroseconds <= TTI_MEDIUM_TIMING) {
        scoreClassification = ScoreClassification.OK;
    }
    if (ttiTimeInMicroseconds <= TTI_GOOD_TIMING) {
        scoreClassification = ScoreClassification.GOOD;
    }
    return scoreClassification;
}
/**
 * Classifications sourced from
 * https://web.dev/lcp/#what-is-lcp
 */
export function scoreClassificationForLargestContentfulPaint(lcpTimeInMicroseconds) {
    const LCP_GOOD_TIMING = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(2.5));
    const LCP_MEDIUM_TIMING = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(4));
    let scoreClassification = ScoreClassification.BAD;
    if (lcpTimeInMicroseconds <= LCP_MEDIUM_TIMING) {
        scoreClassification = ScoreClassification.OK;
    }
    if (lcpTimeInMicroseconds <= LCP_GOOD_TIMING) {
        scoreClassification = ScoreClassification.GOOD;
    }
    return scoreClassification;
}
/**
 * DCL does not have a classification.
 */
export function scoreClassificationForDOMContentLoaded(_dclTimeInMicroseconds) {
    return ScoreClassification.UNCLASSIFIED;
}
/**
 * Classifications sourced from
 * https://web.dev/lighthouse-total-blocking-#time/
 */
export function scoreClassificationForTotalBlockingTime(tbtTimeInMicroseconds) {
    const TBT_GOOD_TIMING = Helpers.Timing.milliToMicro(Types.Timing.Milli(200));
    const TBT_MEDIUM_TIMING = Helpers.Timing.milliToMicro(Types.Timing.Milli(600));
    let scoreClassification = ScoreClassification.BAD;
    if (tbtTimeInMicroseconds <= TBT_MEDIUM_TIMING) {
        scoreClassification = ScoreClassification.OK;
    }
    if (tbtTimeInMicroseconds <= TBT_GOOD_TIMING) {
        scoreClassification = ScoreClassification.GOOD;
    }
    return scoreClassification;
}
/**
 * Gets all the Largest Contentful Paint scores of all the frames in the
 * trace.
 */
function gatherFinalLCPEvents() {
    const allFinalLCPEvents = [];
    const dataForAllFrames = [...metricScoresByFrameId.values()];
    const dataForAllNavigations = dataForAllFrames.flatMap(frameData => [...frameData.values()]);
    for (let i = 0; i < dataForAllNavigations.length; i++) {
        const navigationData = dataForAllNavigations[i];
        const lcpInNavigation = navigationData.get(MetricName.LCP);
        if (!lcpInNavigation?.event) {
            continue;
        }
        allFinalLCPEvents.push(lcpInNavigation.event);
    }
    return allFinalLCPEvents;
}
export async function finalize() {
    pageLoadEventsArray.sort((a, b) => a.ts - b.ts);
    for (const pageLoadEvent of pageLoadEventsArray) {
        const navigation = getNavigationForPageLoadEvent(pageLoadEvent);
        if (navigation) {
            // Event's navigation was not filtered out as noise.
            storePageLoadMetricAgainstNavigationId(navigation, pageLoadEvent);
        }
    }
    const { navigationsByFrameId } = metaHandlerData();
    metaCharsetCheckEventsArray.sort((a, b) => a.ts - b.ts);
    for (const metaCharsetCheckEvent of metaCharsetCheckEventsArray) {
        const frameId = metaCharsetCheckEvent.args.data?.frame;
        if (!frameId) {
            continue;
        }
        const navigation = Helpers.Trace.getNavigationForTraceEvent(metaCharsetCheckEvent, frameId, navigationsByFrameId);
        if (!navigation) {
            continue;
        }
        const eventsForNavigation = Platform.MapUtilities.getWithDefault(metaCharsetCheckEventsByNavigation, navigation, () => []);
        eventsForNavigation.push(metaCharsetCheckEvent);
    }
    // NOTE: if you are looking for the TBT calculation, it has temporarily been
    // removed. See crbug.com/1424335 for details.
    const allFinalLCPEvents = gatherFinalLCPEvents();
    const mainFrame = metaHandlerData().mainFrameId;
    // Filter out LCP candidates to use only definitive LCP values
    const allEventsButLCP = pageLoadEventsArray.filter(event => !Types.Events.isAnyLargestContentfulPaintCandidate(event));
    const markerEvents = [...allEventsButLCP, ...allFinalLCPEvents].filter(Types.Events.isMarkerEvent);
    // Filter by main frame and sort.
    allMarkerEvents =
        markerEvents.filter(event => getFrameIdForPageLoadEvent(event) === mainFrame).sort((a, b) => a.ts - b.ts);
}
export function data() {
    return {
        metricScoresByFrameId,
        allMarkerEvents,
        metaCharsetCheckEventsByNavigation,
    };
}
export function deps() {
    return ['Meta'];
}
export var ScoreClassification;
(function (ScoreClassification) {
    ScoreClassification["GOOD"] = "good";
    ScoreClassification["OK"] = "ok";
    ScoreClassification["BAD"] = "bad";
    // Some metrics (such as DOMContentLoaded) don't have a Good/OK/Bad classification, hence this additional entry.
    ScoreClassification["UNCLASSIFIED"] = "unclassified";
})(ScoreClassification || (ScoreClassification = {}));
export var MetricName;
(function (MetricName) {
    // First Contentful Paint
    MetricName["FCP"] = "FCP";
    // First Paint
    MetricName["FP"] = "FP";
    // MarkLoad
    MetricName["L"] = "L";
    MetricName["LCP"] = "LCP";
    // Mark DOM Content
    MetricName["DCL"] = "DCL";
    // Time To Interactive
    MetricName["TTI"] = "TTI";
    // Total Blocking Time
    MetricName["TBT"] = "TBT";
    // Cumulative Layout Shift
    MetricName["CLS"] = "CLS";
    // Navigation
    MetricName["NAV"] = "Nav";
    // Soft Navigation and Soft Metrics
    MetricName["SOFT_NAV"] = "Nav*";
    MetricName["SOFT_FCP"] = "FCP*";
    MetricName["SOFT_LCP"] = "LCP*";
    // Note: INP is handled in UserInteractionsHandler
})(MetricName || (MetricName = {}));
export function metricIsLCP(metric) {
    return metric.metricName === MetricName.LCP;
}
//# sourceMappingURL=PageLoadMetricsHandler.js.map