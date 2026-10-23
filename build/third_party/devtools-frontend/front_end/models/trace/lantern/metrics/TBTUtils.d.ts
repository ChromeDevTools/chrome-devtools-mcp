declare const BLOCKING_TIME_THRESHOLD = 50;
/**
 * For TBT, We only want to consider tasks that fall in our time range
 * - FCP and TTI for navigation mode
 * - Trace start and trace end for timespan mode
 *
 * FCP is picked as `startTimeMs` because there is little risk of user input happening
 * before FCP so Long Queuing Qelay regions do not harm user experience. Developers should be
 * optimizing to reach FCP as fast as possible without having to worry about task lengths.
 *
 * TTI is picked as `endTimeMs` because we want a well defined end point for page load.
 *
 * @param startTimeMs Should be FCP in navigation mode and the trace start time in timespan mode
 * @param endTimeMs Should be TTI in navigation mode and the trace end time in timespan mode
 * @param topLevelEvent Leave unset if `event` is top level. Has no effect if `event` has the same duration as `topLevelEvent`.
 */
declare function calculateTbtImpactForEvent(event: {
    start: number;
    end: number;
    duration: number;
}, startTimeMs: number, endTimeMs: number, topLevelEvent?: {
    start: number;
    end: number;
    duration: number;
}): number;
declare function calculateSumOfBlockingTime(topLevelEvents: Array<{
    start: number;
    end: number;
    duration: number;
}>, startTimeMs: number, endTimeMs: number): number;
export { BLOCKING_TIME_THRESHOLD, calculateSumOfBlockingTime, calculateTbtImpactForEvent, };
