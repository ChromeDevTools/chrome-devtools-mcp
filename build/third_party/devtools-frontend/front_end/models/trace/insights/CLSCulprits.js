// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides details about why elements shift/move on the page. The causes for these shifts are referred to as culprits ("reasons").
     */
    title: 'Layout shift culprits',
    /**
     * @description Description of a DevTools insight that identifies the reasons that elements shift on the page.
     * This is displayed after a user expands the section to see more. No character length limits.
     */
    description: 'Layout shifts occur when elements move absent any user interaction. [Investigate the causes of layout shifts](https://developer.chrome.com/docs/performance/insights/cls-culprit), such as elements being added, removed, or their fonts changing as the page loads.',
    /**
     * @description Text indicating the worst layout shift cluster.
     */
    worstLayoutShiftCluster: 'Worst layout shift cluster',
    /**
     * @description Text indicating the worst layout shift cluster.
     */
    worstCluster: 'Worst cluster',
    /**
     * @description Text indicating a layout shift cluster and its start time.
     * @example {32 ms} PH1
     */
    layoutShiftCluster: 'Layout shift cluster @ {PH1}',
    /**
     * @description Text indicating the biggest reasons for the layout shifts.
     */
    topCulprits: 'Top layout shift culprits',
    /**
     * @description Text for a culprit type of Injected iframe.
     */
    injectedIframe: 'Injected iframe',
    /**
     * @description Text for a culprit type of web font request.
     */
    webFont: 'Web font',
    /**
     * @description Text for a culprit type of Animation.
     */
    animation: 'Animation',
    /**
     * @description Text for a culprit type of Unsized image.
     */
    unsizedImage: 'Unsized image element',
    /**
     * @description Text status when there were no layout shifts detected.
     */
    noLayoutShifts: 'No layout shifts',
    /**
     * @description Text status when no layout shift culprits or root causes were found.
     */
    noCulprits: 'Couldn’t detect any layout shift culprits',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/CLSCulprits.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export var AnimationFailureReasons;
(function (AnimationFailureReasons) {
    AnimationFailureReasons["ACCELERATED_ANIMATIONS_DISABLED"] = "ACCELERATED_ANIMATIONS_DISABLED";
    AnimationFailureReasons["EFFECT_SUPPRESSED_BY_DEVTOOLS"] = "EFFECT_SUPPRESSED_BY_DEVTOOLS";
    AnimationFailureReasons["INVALID_ANIMATION_OR_EFFECT"] = "INVALID_ANIMATION_OR_EFFECT";
    AnimationFailureReasons["EFFECT_HAS_UNSUPPORTED_TIMING_PARAMS"] = "EFFECT_HAS_UNSUPPORTED_TIMING_PARAMS";
    AnimationFailureReasons["EFFECT_HAS_NON_REPLACE_COMPOSITE_MODE"] = "EFFECT_HAS_NON_REPLACE_COMPOSITE_MODE";
    AnimationFailureReasons["TARGET_HAS_INVALID_COMPOSITING_STATE"] = "TARGET_HAS_INVALID_COMPOSITING_STATE";
    AnimationFailureReasons["TARGET_HAS_INCOMPATIBLE_ANIMATIONS"] = "TARGET_HAS_INCOMPATIBLE_ANIMATIONS";
    AnimationFailureReasons["TARGET_HAS_CSS_OFFSET"] = "TARGET_HAS_CSS_OFFSET";
    AnimationFailureReasons["ANIMATION_AFFECTS_NON_CSS_PROPERTIES"] = "ANIMATION_AFFECTS_NON_CSS_PROPERTIES";
    AnimationFailureReasons["TRANSFORM_RELATED_PROPERTY_CANNOT_BE_ACCELERATED_ON_TARGET"] = "TRANSFORM_RELATED_PROPERTY_CANNOT_BE_ACCELERATED_ON_TARGET";
    AnimationFailureReasons["TRANSFROM_BOX_SIZE_DEPENDENT"] = "TRANSFROM_BOX_SIZE_DEPENDENT";
    AnimationFailureReasons["FILTER_RELATED_PROPERTY_MAY_MOVE_PIXELS"] = "FILTER_RELATED_PROPERTY_MAY_MOVE_PIXELS";
    AnimationFailureReasons["UNSUPPORTED_CSS_PROPERTY"] = "UNSUPPORTED_CSS_PROPERTY";
    AnimationFailureReasons["MIXED_KEYFRAME_VALUE_TYPES"] = "MIXED_KEYFRAME_VALUE_TYPES";
    AnimationFailureReasons["TIMELINE_SOURCE_HAS_INVALID_COMPOSITING_STATE"] = "TIMELINE_SOURCE_HAS_INVALID_COMPOSITING_STATE";
    AnimationFailureReasons["ANIMATION_HAS_NO_VISIBLE_CHANGE"] = "ANIMATION_HAS_NO_VISIBLE_CHANGE";
    AnimationFailureReasons["AFFECTS_IMPORTANT_PROPERTY"] = "AFFECTS_IMPORTANT_PROPERTY";
    AnimationFailureReasons["SVG_TARGET_HAS_INDEPENDENT_TRANSFORM_PROPERTY"] = "SVG_TARGET_HAS_INDEPENDENT_TRANSFORM_PROPERTY";
})(AnimationFailureReasons || (AnimationFailureReasons = {}));
export var LayoutShiftType;
(function (LayoutShiftType) {
    LayoutShiftType[LayoutShiftType["WEB_FONT"] = 0] = "WEB_FONT";
    LayoutShiftType[LayoutShiftType["IFRAMES"] = 1] = "IFRAMES";
    LayoutShiftType[LayoutShiftType["ANIMATIONS"] = 2] = "ANIMATIONS";
    LayoutShiftType[LayoutShiftType["UNSIZED_IMAGE"] = 3] = "UNSIZED_IMAGE";
})(LayoutShiftType || (LayoutShiftType = {}));
/**
 * Each failure reason is represented by a bit flag. The bit shift operator '<<' is used to define
 * which bit corresponds to each failure reason.
 * https://source.chromium.org/search?q=f:compositor_animations.h%20%22enum%20FailureReason%22
 */
const ACTIONABLE_FAILURE_REASONS = [
    {
        flag: 1 << 0,
        failure: AnimationFailureReasons.ACCELERATED_ANIMATIONS_DISABLED,
    },
    {
        flag: 1 << 1,
        failure: AnimationFailureReasons.EFFECT_SUPPRESSED_BY_DEVTOOLS,
    },
    {
        flag: 1 << 2,
        failure: AnimationFailureReasons.INVALID_ANIMATION_OR_EFFECT,
    },
    {
        flag: 1 << 3,
        failure: AnimationFailureReasons.EFFECT_HAS_UNSUPPORTED_TIMING_PARAMS,
    },
    {
        flag: 1 << 4,
        failure: AnimationFailureReasons.EFFECT_HAS_NON_REPLACE_COMPOSITE_MODE,
    },
    {
        flag: 1 << 5,
        failure: AnimationFailureReasons.TARGET_HAS_INVALID_COMPOSITING_STATE,
    },
    {
        flag: 1 << 6,
        failure: AnimationFailureReasons.TARGET_HAS_INCOMPATIBLE_ANIMATIONS,
    },
    {
        flag: 1 << 7,
        failure: AnimationFailureReasons.TARGET_HAS_CSS_OFFSET,
    },
    // The failure 1 << 8 is marked as obsolete in Blink
    {
        flag: 1 << 9,
        failure: AnimationFailureReasons.ANIMATION_AFFECTS_NON_CSS_PROPERTIES,
    },
    {
        flag: 1 << 10,
        failure: AnimationFailureReasons.TRANSFORM_RELATED_PROPERTY_CANNOT_BE_ACCELERATED_ON_TARGET,
    },
    {
        flag: 1 << 11,
        failure: AnimationFailureReasons.TRANSFROM_BOX_SIZE_DEPENDENT,
    },
    {
        flag: 1 << 12,
        failure: AnimationFailureReasons.FILTER_RELATED_PROPERTY_MAY_MOVE_PIXELS,
    },
    {
        flag: 1 << 13,
        failure: AnimationFailureReasons.UNSUPPORTED_CSS_PROPERTY,
    },
    // The failure 1 << 14 is marked as obsolete in Blink
    {
        flag: 1 << 15,
        failure: AnimationFailureReasons.MIXED_KEYFRAME_VALUE_TYPES,
    },
    {
        flag: 1 << 16,
        failure: AnimationFailureReasons.TIMELINE_SOURCE_HAS_INVALID_COMPOSITING_STATE,
    },
    {
        flag: 1 << 17,
        failure: AnimationFailureReasons.ANIMATION_HAS_NO_VISIBLE_CHANGE,
    },
    {
        flag: 1 << 18,
        failure: AnimationFailureReasons.AFFECTS_IMPORTANT_PROPERTY,
    },
    {
        flag: 1 << 19,
        failure: AnimationFailureReasons.SVG_TARGET_HAS_INDEPENDENT_TRANSFORM_PROPERTY,
    },
];
// 500ms window.
// Use this window to consider events and requests that may have caused a layout shift.
const ROOT_CAUSE_WINDOW = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(0.5));
/**
 * Returns if an event happens within the root cause window, before the target event.
 *          ROOT_CAUSE_WINDOW               v target event
 *        |------------------------|=======================
 */
function isInRootCauseWindow(event, targetEvent) {
    const eventEnd = event.dur ? event.ts + event.dur : event.ts;
    return eventEnd < targetEvent.ts && eventEnd >= targetEvent.ts - ROOT_CAUSE_WINDOW;
}
export function getNonCompositedFailure(animationEvent) {
    const failures = [];
    const beginEvent = animationEvent.args.data.beginEvent;
    const instantEvents = animationEvent.args.data.instantEvents || [];
    /**
     * Animation events containing composite information are ASYNC_NESTABLE_INSTANT ('n').
     * An animation may also contain multiple 'n' events, so we look through those with useful non-composited data.
     */
    for (const event of instantEvents) {
        const failureMask = event.args.data.compositeFailed;
        const unsupportedProperties = event.args.data.unsupportedProperties;
        if (!failureMask) {
            continue;
        }
        const failureReasons = ACTIONABLE_FAILURE_REASONS.filter(reason => failureMask & reason.flag).map(reason => reason.failure);
        const failure = {
            name: beginEvent.args.data.displayName,
            failureReasons,
            unsupportedProperties,
            animation: animationEvent,
        };
        failures.push(failure);
    }
    return failures;
}
function getNonCompositedFailureRootCauses(animationEvents, prePaintEvents, shiftsByPrePaint, rootCausesByShift) {
    const allAnimationFailures = [];
    for (const animation of animationEvents) {
        /**
         * Animation events containing composite information are ASYNC_NESTABLE_INSTANT ('n').
         * An animation may also contain multiple 'n' events, so we look through those with useful non-composited data.
         */
        const failures = getNonCompositedFailure(animation);
        if (!failures) {
            continue;
        }
        allAnimationFailures.push(...failures);
        const nextPrePaint = getNextEvent(prePaintEvents, animation);
        // If no following prePaint, this is not a root cause.
        if (!nextPrePaint) {
            continue;
        }
        // If the animation event is outside the ROOT_CAUSE_WINDOW, it could not be a root cause.
        if (!isInRootCauseWindow(animation, nextPrePaint)) {
            continue;
        }
        const shifts = shiftsByPrePaint.get(nextPrePaint);
        // if no layout shift(s), this is not a root cause.
        if (!shifts) {
            continue;
        }
        for (const shift of shifts) {
            const rootCausesForShift = rootCausesByShift.get(shift);
            if (!rootCausesForShift) {
                throw new Error('Unaccounted shift');
            }
            rootCausesForShift.nonCompositedAnimations.push(...failures);
        }
    }
    return allAnimationFailures;
}
/**
 * Given an array of layout shift and PrePaint events, returns a mapping from
 * PrePaint events to layout shifts dispatched within it.
 */
function getShiftsByPrePaintEvents(layoutShifts, prePaintEvents) {
    // Maps from PrePaint events to LayoutShifts that occurred in each one.
    const shiftsByPrePaint = new Map();
    // Associate all shifts to their corresponding PrePaint.
    for (const prePaintEvent of prePaintEvents) {
        const firstShiftIndex = Platform.ArrayUtilities.nearestIndexFromBeginning(layoutShifts, shift => shift.ts >= prePaintEvent.ts);
        if (firstShiftIndex === null) {
            // No layout shifts registered after this PrePaint start. Continue.
            continue;
        }
        for (let i = firstShiftIndex; i < layoutShifts.length; i++) {
            const shift = layoutShifts[i];
            if (shift.ts >= prePaintEvent.ts && shift.ts <= prePaintEvent.ts + prePaintEvent.dur) {
                const shiftsInPrePaint = Platform.MapUtilities.getWithDefault(shiftsByPrePaint, prePaintEvent, () => []);
                shiftsInPrePaint.push(shift);
            }
            if (shift.ts > prePaintEvent.ts + prePaintEvent.dur) {
                // Reached all layoutShifts of this PrePaint. Break out to continue with the next prePaint event.
                break;
            }
        }
    }
    return shiftsByPrePaint;
}
/**
 * Given a source event list, this returns the first event of that list that directly follows the target event.
 */
function getNextEvent(sourceEvents, targetEvent) {
    const index = Platform.ArrayUtilities.nearestIndexFromBeginning(sourceEvents, source => source.ts > targetEvent.ts + (targetEvent.dur || 0));
    // No PrePaint event registered after this event
    if (index === null) {
        return undefined;
    }
    return sourceEvents[index];
}
/**
 * An Iframe is considered a root cause if the iframe event occurs before a prePaint event
 * and within this prePaint event a layout shift(s) occurs.
 */
function getIframeRootCauses(data, iframeCreatedEvents, prePaintEvents, shiftsByPrePaint, rootCausesByShift, domLoadingEvents) {
    for (const iframeEvent of iframeCreatedEvents) {
        const nextPrePaint = getNextEvent(prePaintEvents, iframeEvent);
        // If no following prePaint, this is not a root cause.
        if (!nextPrePaint) {
            continue;
        }
        const shifts = shiftsByPrePaint.get(nextPrePaint);
        // if no layout shift(s), this is not a root cause.
        if (!shifts) {
            continue;
        }
        for (const shift of shifts) {
            const rootCausesForShift = rootCausesByShift.get(shift);
            if (!rootCausesForShift) {
                throw new Error('Unaccounted shift');
            }
            // Look for the first dom event that occurs within the bounds of the iframe event.
            // This contains the frame id.
            const domEvent = domLoadingEvents.find(e => {
                const maxIframe = Types.Timing.Micro(iframeEvent.ts + (iframeEvent.dur ?? 0));
                return e.ts >= iframeEvent.ts && e.ts <= maxIframe;
            });
            if (domEvent?.args.frame) {
                const frame = domEvent.args.frame;
                let url;
                const processes = data.Meta.rendererProcessesByFrame.get(frame);
                if (processes && processes.size > 0) {
                    url = [...processes.values()][0]?.[0].frame.url;
                }
                rootCausesForShift.iframes.push({ frame, url });
            }
        }
    }
    return rootCausesByShift;
}
/**
 * An unsized image is considered a root cause if its PaintImage can be correlated to a
 * layout shift. We can correlate PaintImages with unsized images by their matching nodeIds.
 *                           X      <- layout shift
 *              |----------------|
 *                    ^ PrePaint event   |-----|
 *                                          ^ PaintImage
 */
function getUnsizedImageRootCauses(unsizedImageEvents, paintImageEvents, shiftsByPrePaint, rootCausesByShift) {
    shiftsByPrePaint.forEach((shifts, prePaint) => {
        const paintImage = getNextEvent(paintImageEvents, prePaint);
        if (!paintImage) {
            return;
        }
        // The unsized image corresponds to this PaintImage.
        const matchingNode = unsizedImageEvents.find(unsizedImage => unsizedImage.args.data.nodeId === paintImage.args.data.nodeId);
        if (!matchingNode) {
            return;
        }
        // The unsized image is a potential root cause of all the shifts of this prePaint.
        for (const shift of shifts) {
            const rootCausesForShift = rootCausesByShift.get(shift);
            if (!rootCausesForShift) {
                throw new Error('Unaccounted shift');
            }
            rootCausesForShift.unsizedImages.push({
                backendNodeId: matchingNode.args.data.nodeId,
                paintImageEvent: paintImage,
            });
        }
    });
    return rootCausesByShift;
}
export function isCLSCulpritsInsight(insight) {
    return insight.insightKey === InsightKeys.CLS_CULPRITS;
}
/**
 * A font request is considered a root cause if the request occurs before a prePaint event
 * and within this prePaint event a layout shift(s) occurs. Additionally, this font request should
 * happen within the ROOT_CAUSE_WINDOW of the prePaint event.
 */
function getFontRootCauses(networkRequests, prePaintEvents, shiftsByPrePaint, rootCausesByShift) {
    const fontRequests = networkRequests.filter(req => req.args.data.resourceType === 'Font' && req.args.data.mimeType.startsWith('font'));
    for (const req of fontRequests) {
        const nextPrePaint = getNextEvent(prePaintEvents, req);
        if (!nextPrePaint) {
            continue;
        }
        // If the req is outside the ROOT_CAUSE_WINDOW, it could not be a root cause.
        if (!isInRootCauseWindow(req, nextPrePaint)) {
            continue;
        }
        // Get the shifts that belong to this prepaint
        const shifts = shiftsByPrePaint.get(nextPrePaint);
        // if no layout shift(s) in this prePaint, the request is not a root cause.
        if (!shifts) {
            continue;
        }
        // Include the root cause to the shifts in this prePaint.
        for (const shift of shifts) {
            const rootCausesForShift = rootCausesByShift.get(shift);
            if (!rootCausesForShift) {
                throw new Error('Unaccounted shift');
            }
            rootCausesForShift.webFonts.push(req);
        }
    }
    return rootCausesByShift;
}
/**
 * Returns the top 3 shift root causes based on the given cluster.
 */
function getTopCulprits(cluster, culpritsByShift) {
    const MAX_TOP_CULPRITS = 3;
    const causes = [];
    const shifts = cluster.events;
    for (const shift of shifts) {
        const culprits = culpritsByShift.get(shift);
        if (!culprits) {
            continue;
        }
        const fontReq = culprits.webFonts;
        const iframes = culprits.iframes;
        const animations = culprits.nonCompositedAnimations;
        const unsizedImages = culprits.unsizedImages;
        for (let i = 0; i < fontReq.length && causes.length < MAX_TOP_CULPRITS; i++) {
            causes.push({ type: LayoutShiftType.WEB_FONT, description: i18nString(UIStrings.webFont) });
        }
        for (let i = 0; i < iframes.length && causes.length < MAX_TOP_CULPRITS; i++) {
            causes.push({ type: LayoutShiftType.IFRAMES, description: i18nString(UIStrings.injectedIframe) });
        }
        for (let i = 0; i < animations.length && causes.length < MAX_TOP_CULPRITS; i++) {
            causes.push({ type: LayoutShiftType.ANIMATIONS, description: i18nString(UIStrings.animation) });
        }
        for (let i = 0; i < unsizedImages.length && causes.length < MAX_TOP_CULPRITS; i++) {
            causes.push({
                type: LayoutShiftType.UNSIZED_IMAGE,
                description: i18nString(UIStrings.unsizedImage),
                url: unsizedImages[i].paintImageEvent.args.data.url || '',
                backendNodeId: unsizedImages[i].backendNodeId,
                frame: unsizedImages[i].paintImageEvent.args.data.frame || '',
            });
        }
        if (causes.length >= MAX_TOP_CULPRITS) {
            break;
        }
    }
    return causes.slice(0, MAX_TOP_CULPRITS);
}
function finalize(partialModel) {
    let state = 'pass';
    if (partialModel.worstCluster) {
        const classification = Handlers.ModelHandlers.LayoutShifts.scoreClassificationForLayoutShift(partialModel.worstCluster.clusterCumulativeScore);
        if (classification === Handlers.ModelHandlers.PageLoadMetrics.ScoreClassification.GOOD) {
            state = 'informative';
        }
        else {
            state = 'fail';
        }
    }
    return {
        insightKey: InsightKeys.CLS_CULPRITS,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/cls-culprit',
        category: InsightCategory.CLS,
        state,
        ...partialModel,
    };
}
export function generateInsight(data, context) {
    const isWithinContext = (event) => Helpers.Timing.eventIsInBounds(event, context.bounds);
    const compositeAnimationEvents = data.Animations.animations.filter(isWithinContext);
    const iframeEvents = data.LayoutShifts.renderFrameImplCreateChildFrameEvents.filter(isWithinContext);
    const networkRequests = data.NetworkRequests.byTime.filter(isWithinContext);
    const domLoadingEvents = data.LayoutShifts.domLoadingEvents.filter(isWithinContext);
    const unsizedImageEvents = data.LayoutShifts.layoutImageUnsizedEvents.filter(isWithinContext);
    const clusters = data.LayoutShifts.clusters.filter(isWithinContext);
    const clustersByScore = clusters.toSorted((a, b) => b.clusterCumulativeScore - a.clusterCumulativeScore);
    const worstCluster = clustersByScore.at(0);
    const layoutShifts = clusters.flatMap(cluster => cluster.events);
    const prePaintEvents = data.LayoutShifts.prePaintEvents.filter(isWithinContext);
    const paintImageEvents = data.LayoutShifts.paintImageEvents.filter(isWithinContext);
    // Get root causes.
    const rootCausesByShift = new Map();
    const shiftsByPrePaint = getShiftsByPrePaintEvents(layoutShifts, prePaintEvents);
    for (const shift of layoutShifts) {
        rootCausesByShift.set(shift, { iframes: [], webFonts: [], nonCompositedAnimations: [], unsizedImages: [] });
    }
    // Populate root causes for rootCausesByShift.
    getIframeRootCauses(data, iframeEvents, prePaintEvents, shiftsByPrePaint, rootCausesByShift, domLoadingEvents);
    getFontRootCauses(networkRequests, prePaintEvents, shiftsByPrePaint, rootCausesByShift);
    getUnsizedImageRootCauses(unsizedImageEvents, paintImageEvents, shiftsByPrePaint, rootCausesByShift);
    const animationFailures = getNonCompositedFailureRootCauses(compositeAnimationEvents, prePaintEvents, shiftsByPrePaint, rootCausesByShift);
    const relatedEvents = [...layoutShifts];
    if (worstCluster) {
        relatedEvents.push(worstCluster);
    }
    const topCulpritsByCluster = new Map();
    for (const cluster of clusters) {
        topCulpritsByCluster.set(cluster, getTopCulprits(cluster, rootCausesByShift));
    }
    return finalize({
        relatedEvents,
        animationFailures,
        shifts: rootCausesByShift,
        clusters,
        worstCluster,
        topCulpritsByCluster,
    });
}
export function createOverlays(model) {
    const clustersByScore = model.clusters.toSorted((a, b) => b.clusterCumulativeScore - a.clusterCumulativeScore) ?? [];
    const worstCluster = clustersByScore[0];
    if (!worstCluster) {
        return [];
    }
    const range = Types.Timing.Micro(worstCluster.dur ?? 0);
    const max = Types.Timing.Micro(worstCluster.ts + range);
    return [{
            type: 'TIMESPAN_BREAKDOWN',
            sections: [
                {
                    bounds: { min: worstCluster.ts, range, max },
                    label: i18nString(UIStrings.worstLayoutShiftCluster),
                    showDuration: false,
                },
            ],
            // This allows for the overlay to sit over the layout shift.
            entry: worstCluster.events[0],
            renderLocation: 'ABOVE_EVENT',
        }];
}
//# sourceMappingURL=CLSCulprits.js.map