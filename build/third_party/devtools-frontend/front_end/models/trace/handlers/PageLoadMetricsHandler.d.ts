import * as Types from '../types/types.js';
import type { HandlerName } from './types.js';
type AnyNavigationStart = Types.Events.NavigationStart | Types.Events.SoftNavigationStart;
export declare function reset(): void;
export declare function handleUserConfig(userConfig: Types.Configuration.Configuration): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function getFrameIdForPageLoadEvent(event: Types.Events.PageLoadEvent): string;
/**
 * Classifications sourced from
 * https://web.dev/fcp/
 */
export declare function scoreClassificationForFirstContentfulPaint(fcpScoreInMicroseconds: Types.Timing.Micro): ScoreClassification;
/**
 * Classifications sourced from
 * https://web.dev/interactive/#how-lighthouse-determines-your-tti-score
 */
export declare function scoreClassificationForTimeToInteractive(ttiTimeInMicroseconds: Types.Timing.Micro): ScoreClassification;
/**
 * Classifications sourced from
 * https://web.dev/lcp/#what-is-lcp
 */
export declare function scoreClassificationForLargestContentfulPaint(lcpTimeInMicroseconds: Types.Timing.Micro): ScoreClassification;
/**
 * DCL does not have a classification.
 */
export declare function scoreClassificationForDOMContentLoaded(_dclTimeInMicroseconds: Types.Timing.Micro): ScoreClassification;
/**
 * Classifications sourced from
 * https://web.dev/lighthouse-total-blocking-#time/
 */
export declare function scoreClassificationForTotalBlockingTime(tbtTimeInMicroseconds: Types.Timing.Micro): ScoreClassification;
export declare function finalize(): Promise<void>;
export interface PageLoadMetricsData {
    /**
     * This represents the metric scores for all navigations, for all frames in a trace.
     * Given a frame id, the map points to another map from navigation id to metric scores.
     * The metric scores include the event related to the metric as well as the data regarding
     * the score itself.
     *
     * Includes soft navigations.
     */
    metricScoresByFrameId: Map<string, Map<AnyNavigationStart, Map<MetricName, MetricScore>>>;
    /**
     * Page load events with no associated duration that happened in the
     * main frame.
     */
    allMarkerEvents: Types.Events.PageLoadEvent[];
    /**
     * MetaCharsetCheck events grouped by navigation.
     */
    metaCharsetCheckEventsByNavigation: WeakMap<AnyNavigationStart, Types.Events.MetaCharsetCheck[]>;
}
export declare function data(): PageLoadMetricsData;
export declare function deps(): HandlerName[];
export declare enum ScoreClassification {
    GOOD = "good",
    OK = "ok",
    BAD = "bad",
    UNCLASSIFIED = "unclassified"
}
export declare enum MetricName {
    FCP = "FCP",
    FP = "FP",
    L = "L",
    LCP = "LCP",
    DCL = "DCL",
    TTI = "TTI",
    TBT = "TBT",
    CLS = "CLS",
    NAV = "Nav",
    SOFT_NAV = "Nav*",
    SOFT_FCP = "FCP*",
    SOFT_LCP = "LCP*"
}
export interface MetricScore {
    metricName: MetricName;
    classification: ScoreClassification;
    event?: Types.Events.PageLoadEvent;
    navigation?: AnyNavigationStart;
    estimated?: boolean;
    timing: Types.Timing.Micro;
}
export type LCPMetricScore = MetricScore & {
    event: Types.Events.LargestContentfulPaintCandidate;
    metricName: MetricName.LCP;
};
export declare function metricIsLCP(metric: MetricScore): metric is LCPMetricScore;
export {};
