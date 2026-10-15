// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
const frameStateByFrame = new Map();
let maxInvalidationsPerEvent = null;
export function reset() {
    frameStateByFrame.clear();
    maxInvalidationsPerEvent = null;
}
export function handleUserConfig(userConfig) {
    maxInvalidationsPerEvent = userConfig.maxInvalidationEventsPerEvent;
}
function getState(frameId) {
    let frameState = frameStateByFrame.get(frameId);
    if (!frameState) {
        frameState = {
            invalidationsForEvent: new Map(),
            invalidationCountForEvent: new Map(),
            lastRecalcStyleEvent: null,
            pendingInvalidations: [],
            hasPainted: false,
        };
        frameStateByFrame.set(frameId, frameState);
    }
    return frameState;
}
function getFrameId(event) {
    return Helpers.Trace.frameIDForEvent(event);
}
function addInvalidationToEvent(frameState, event, invalidation) {
    const existingInvalidations = frameState.invalidationsForEvent.get(event) || [];
    existingInvalidations.push(invalidation);
    if (maxInvalidationsPerEvent !== null && existingInvalidations.length > maxInvalidationsPerEvent) {
        existingInvalidations.shift();
    }
    frameState.invalidationsForEvent.set(event, existingInvalidations);
    const count = frameState.invalidationCountForEvent.get(event) ?? 0;
    frameState.invalidationCountForEvent.set(event, count + 1);
}
export function handleEvent(event) {
    // Special case: if we have been configured to not store any invalidations,
    // we take that as a sign that we don't even want to gather any invalidations
    // data at all and early exit.
    if (maxInvalidationsPerEvent === 0) {
        return;
    }
    const frameId = getFrameId(event);
    if (!frameId) {
        return;
    }
    const thisFrame = getState(frameId);
    if (Types.Events.isRecalcStyle(event)) {
        thisFrame.lastRecalcStyleEvent = event;
        // Associate any prior invalidations with this recalc event.
        for (const invalidation of thisFrame.pendingInvalidations) {
            if (Types.Events.isLayoutInvalidationTracking(invalidation)) {
                // LayoutInvalidation events cannot be associated with a LayoutTree
                // event.
                continue;
            }
            addInvalidationToEvent(thisFrame, event, invalidation);
        }
        return;
    }
    if (Types.Events.isInvalidationTracking(event)) {
        if (thisFrame.hasPainted) {
            // If we have painted, then we can clear out the list of all existing
            // invalidations, as we cannot associate them across frames.
            thisFrame.pendingInvalidations.length = 0;
            thisFrame.lastRecalcStyleEvent = null;
            thisFrame.hasPainted = false;
        }
        // Style invalidation events can occur before and during recalc styles. When we get a recalc style event, we check and associate any prior invalidations with it.
        // But any invalidations that occur during a RecalcStyle
        // event would be reported in trace events after. So each time we get an
        // invalidation that might be due to a style recalc, we check if the
        // timings overlap and if so associate them.
        if (thisFrame.lastRecalcStyleEvent &&
            (Types.Events.isScheduleStyleInvalidationTracking(event) ||
                Types.Events.isStyleRecalcInvalidationTracking(event) ||
                Types.Events.isStyleInvalidatorInvalidationTracking(event))) {
            const recalcLastRecalc = thisFrame.lastRecalcStyleEvent;
            const recalcEndTime = recalcLastRecalc.ts + (recalcLastRecalc.dur || 0);
            if (event.ts >= recalcLastRecalc.ts && event.ts <= recalcEndTime) {
                addInvalidationToEvent(thisFrame, recalcLastRecalc, event);
            }
        }
        thisFrame.pendingInvalidations.push(event);
        return;
    }
    if (Types.Events.isPaint(event)) {
        thisFrame.hasPainted = true;
        return;
    }
    if (Types.Events.isLayout(event)) {
        for (const invalidation of thisFrame.pendingInvalidations) {
            // The only invalidations that cause a Layout are LayoutInvalidations :)
            if (!Types.Events.isLayoutInvalidationTracking(invalidation)) {
                continue;
            }
            addInvalidationToEvent(thisFrame, event, invalidation);
        }
    }
}
export async function finalize() {
}
export function data() {
    const invalidationsForEvent = new Map();
    const invalidationCountForEvent = new Map();
    for (const frame of frameStateByFrame.values()) {
        for (const [event, invalidations] of frame.invalidationsForEvent.entries()) {
            invalidationsForEvent.set(event, invalidations);
        }
        for (const [event, count] of frame.invalidationCountForEvent.entries()) {
            invalidationCountForEvent.set(event, count);
        }
    }
    return {
        invalidationsForEvent,
        invalidationCountForEvent,
    };
}
//# sourceMappingURL=InvalidationsHandler.js.map