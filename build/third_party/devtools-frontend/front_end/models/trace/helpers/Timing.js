// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';
import { frameIDForEvent, getNavigationForTraceEvent, navigationIDForEvent } from './Trace.js';
export const milliToMicro = (value) => Types.Timing.Micro(value * 1000);
export const secondsToMilli = (value) => Types.Timing.Milli(value * 1000);
export const secondsToMicro = (value) => milliToMicro(secondsToMilli(value));
export const microToMilli = (value) => Types.Timing.Milli(value / 1000);
export const microToSeconds = (value) => Types.Timing.Seconds(value / 1000 / 1000);
export function timeStampForEventAdjustedByClosestNavigation(event, traceBounds, navigationsByNavigationId, softNavigationsById, navigationsByFrameId) {
    let navigationForEvent = null;
    if (Types.Events.isSoftLargestContentfulPaintCandidate(event)) {
        navigationForEvent = softNavigationsById.get(event.args.data.performanceTimelineNavigationId) ?? null;
    }
    else if (Types.Events.isSoftFirstContentfulPaint(event) && event.args?.context?.performanceTimelineNavigationId) {
        navigationForEvent = softNavigationsById.get(event.args.context.performanceTimelineNavigationId) ?? null;
    }
    else if (Types.Events.isSoftNavigationStart(event)) {
        navigationForEvent = getNavigationForTraceEvent(event, event.args.frame, navigationsByFrameId);
    }
    else {
        const navigationId = navigationIDForEvent(event);
        if (navigationId) {
            navigationForEvent = navigationsByNavigationId.get(navigationId) ?? null;
        }
        else {
            const frameId = frameIDForEvent(event);
            if (frameId) {
                navigationForEvent = getNavigationForTraceEvent(event, frameId, navigationsByFrameId);
            }
        }
    }
    if (navigationForEvent) {
        return Types.Timing.Micro(event.ts - navigationForEvent.ts);
    }
    return Types.Timing.Micro(event.ts - traceBounds.min);
}
/**
 * Expands the trace window by a provided percentage or, if it the expanded window is smaller than 1 millisecond, expands it to 1 millisecond.
 * If the expanded window is outside of the max trace window, cut the overflowing bound to the max trace window bound.
 **/
export function expandWindowByPercentOrToOneMillisecond(annotationWindow, maxTraceWindow, percentage) {
    // Expand min and max of the window by half of the provided percentage. That way, in total, the window will be expanded by the provided percentage.
    let newMin = annotationWindow.min - annotationWindow.range * (percentage / 100) / 2;
    let newMax = annotationWindow.max + annotationWindow.range * (percentage / 100) / 2;
    if (newMax - newMin < 1_000) {
        const rangeMiddle = (annotationWindow.min + annotationWindow.max) / 2;
        newMin = rangeMiddle - 500;
        newMax = rangeMiddle + 500;
    }
    newMin = Math.max(newMin, maxTraceWindow.min);
    newMax = Math.min(newMax, maxTraceWindow.max);
    const expandedWindow = {
        min: Types.Timing.Micro(newMin),
        max: Types.Timing.Micro(newMax),
        range: Types.Timing.Micro(newMax - newMin),
    };
    return expandedWindow;
}
export function eventTimingsMicroSeconds(event) {
    return {
        startTime: event.ts,
        endTime: (event.ts + (event.dur ?? 0)),
        duration: (event.dur || 0),
    };
}
export function eventTimingsMilliSeconds(event) {
    return {
        startTime: (event.ts / 1000),
        endTime: (event.ts + (event.dur ?? 0)) / 1000,
        duration: (event.dur || 0) / 1000,
    };
}
export function traceWindowMilliSeconds(bounds) {
    return {
        min: microToMilli(bounds.min),
        max: microToMilli(bounds.max),
        range: microToMilli(bounds.range),
    };
}
export function traceWindowMicroSecondsToMilliSeconds(bounds) {
    return {
        min: microToMilli(bounds.min),
        max: microToMilli(bounds.max),
        range: microToMilli(bounds.range),
    };
}
export function traceWindowFromMilliSeconds(min, max) {
    const traceWindow = {
        min: milliToMicro(min),
        max: milliToMicro(max),
        range: Types.Timing.Micro(milliToMicro(max) - milliToMicro(min)),
    };
    return traceWindow;
}
export function traceWindowFromMicroSeconds(min, max) {
    const traceWindow = {
        min,
        max,
        range: (max - min),
    };
    return traceWindow;
}
export function traceWindowFromEvent(event) {
    return {
        min: event.ts,
        max: event.ts + (event.dur ?? 0),
        range: event.dur ?? 0,
    };
}
export function traceWindowFromOverlay(overlay) {
    switch (overlay.type) {
        case 'ENTRY_LABEL':
        case 'ENTRY_OUTLINE':
        case 'ENTRY_SELECTED':
        case 'COMMENT_PIN': {
            return traceWindowFromEvent(overlay.entry);
        }
        case 'TIMESPAN_BREAKDOWN': {
            const windows = overlay.sections.map(s => s.bounds);
            if (overlay.entry) {
                windows.push(traceWindowFromEvent(overlay.entry));
            }
            return combineTraceWindowsMicro(windows);
        }
        case 'CANDY_STRIPED_TIME_RANGE':
        case 'TIME_RANGE': {
            return structuredClone(overlay.bounds);
        }
        case 'ENTRIES_LINK': {
            const from = traceWindowFromEvent(overlay.entryFrom);
            if (!overlay.entryTo) {
                return from;
            }
            const to = traceWindowFromEvent(overlay.entryTo);
            return combineTraceWindowsMicro([from, to]);
        }
        case 'TIMESTAMP_MARKER':
            return traceWindowFromMicroSeconds(overlay.timestamp, overlay.timestamp);
        case 'TIMINGS_MARKER':
            return traceWindowFromMicroSeconds(overlay.adjustedTimestamp, overlay.adjustedTimestamp);
        case 'BOTTOM_INFO_BAR':
            return null;
        default:
            Platform.TypeScriptUtilities.assertNever(overlay, `Unexpected overlay ${overlay}`);
    }
}
/**
 * Combines (as in a union) multiple windows into one.
 */
export function combineTraceWindowsMicro(windows) {
    if (!windows.length) {
        return null;
    }
    const result = structuredClone(windows[0]);
    for (const bounds of windows.slice(1)) {
        result.min = Math.min(result.min, bounds.min);
        result.max = Math.max(result.max, bounds.max);
    }
    result.range = result.max - result.min;
    return result;
}
/**
 * Checks to see if the timeRange is within the bounds. By "within" we mean
 * "has any overlap":
 *         |------------------------|
 *      ==                                     no overlap (entirely before)
 *       =========                             overlap
 *            =========                        overlap
 *                             =========       overlap
 *                                     ====    no overlap (entirely after)
 *        ==============================       overlap (time range is larger than bounds)
 *         |------------------------|
 */
export function boundsIncludeTimeRange(data) {
    const { min: visibleMin, max: visibleMax } = data.bounds;
    const { min: rangeMin, max: rangeMax } = data.timeRange;
    return visibleMin <= rangeMax && visibleMax >= rangeMin;
}
/** Checks to see if the event is within or overlaps the bounds */
export function eventIsInBounds(event, bounds) {
    const startTime = event.ts;
    return startTime <= bounds.max && bounds.min < (startTime + (event.dur ?? 0));
}
export function timestampIsInBounds(bounds, timestamp) {
    return timestamp >= bounds.min && timestamp <= bounds.max;
}
/**
 * Returns true if the window fits entirely within the bounds.
 * Note that if the window is equivalent to the bounds, that is considered to fit
 */
export function windowFitsInsideBounds(data) {
    return data.window.min >= data.bounds.min && data.window.max <= data.bounds.max;
}
export function windowsEqual(w1, w2) {
    return w1.min === w2.min && w1.max === w2.max;
}
//# sourceMappingURL=Timing.js.map