// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as AsyncJSCallsHandlerData } from './AsyncJSCallsHandler.js';
import { data as flowsHandlerData } from './FlowsHandler.js';
let lastScheduleStyleRecalcByFrame = new Map();
// This tracks the last event that is considered to have invalidated the layout
// for a given frame.
// Note that although there is an InvalidateLayout event, there are also other
// events (ScheduleStyleRecalculation) that could be the reason a layout was
// invalidated.
let lastInvalidationEventForFrame = new Map();
let lastRecalcByFrame = new Map();
// These two maps store the same data but in different directions.
// For a given event, tell me what its initiator was. An event can only have one initiator.
let eventToInitiatorMap = new WeakMap();
// For a given event, tell me what events it initiated. An event can initiate
// multiple events, hence why the value for this map is an array.
let initiatorToEventsMap = new WeakMap();
let timerInstallEventsById = new Map();
let requestIdleCallbackEventsById = new Map();
let webSocketCreateEventsById = new Map();
let schedulePostTaskCallbackEventsById = new Map();
export function reset() {
    lastScheduleStyleRecalcByFrame = new Map();
    lastInvalidationEventForFrame = new Map();
    lastRecalcByFrame = new Map();
    timerInstallEventsById = new Map();
    eventToInitiatorMap = new WeakMap();
    initiatorToEventsMap = new WeakMap();
    requestIdleCallbackEventsById = new Map();
    webSocketCreateEventsById = new Map();
    schedulePostTaskCallbackEventsById = new Map();
}
function storeInitiator(data) {
    eventToInitiatorMap.set(data.event, data.initiator);
    const eventsForInitiator = initiatorToEventsMap.get(data.initiator) || [];
    eventsForInitiator.push(data.event);
    initiatorToEventsMap.set(data.initiator, eventsForInitiator);
}
/**
 * IMPORTANT: Before adding support for new initiator relationships in
 * trace events consider using Perfetto's flow API on the events in
 * question, so that they get automatically computed.
 * @see {@link flowsHandlerData}
 *
 * The events manually computed here were added before we had support
 * for flow events. As such they should be migrated to use the flow
 * API so that no manual parsing is needed.
 */
export function handleEvent(event) {
    if (Types.Events.isScheduleStyleRecalculation(event)) {
        lastScheduleStyleRecalcByFrame.set(event.args.data.frame, event);
    }
    else if (Types.Events.isRecalcStyle(event)) {
        if (event.args.beginData) {
            // Store the last RecalcStyle event: we use this when we see an
            // InvalidateLayout and try to figure out its initiator.
            lastRecalcByFrame.set(event.args.beginData.frame, event);
            // If this frame has seen a ScheduleStyleRecalc event, then that event is
            // considered to be the initiator of this StylesRecalc.
            const scheduledStyleForFrame = lastScheduleStyleRecalcByFrame.get(event.args.beginData.frame);
            if (scheduledStyleForFrame) {
                storeInitiator({
                    event,
                    initiator: scheduledStyleForFrame,
                });
            }
        }
    }
    else if (Types.Events.isInvalidateLayout(event)) {
        // By default, the InvalidateLayout event is what triggered the layout invalidation for this frame.
        let invalidationInitiator = event;
        // However, if we have not had any prior invalidations for this frame, we
        // want to consider StyleRecalculation events as they might be the actual
        // cause of this layout invalidation.
        if (!lastInvalidationEventForFrame.has(event.args.data.frame)) {
            // 1. If we have not had an invalidation event for this frame
            // 2. AND we have had an RecalcStyle for this frame
            // 3. AND the RecalcStyle event ended AFTER the InvalidateLayout startTime
            // 4. AND we have an initiator for the RecalcStyle event
            // 5. Then we set the last invalidation event for this frame to be the RecalcStyle's initiator.
            const lastRecalcStyleForFrame = lastRecalcByFrame.get(event.args.data.frame);
            if (lastRecalcStyleForFrame) {
                const { endTime } = Helpers.Timing.eventTimingsMicroSeconds(lastRecalcStyleForFrame);
                const initiatorOfRecalcStyle = eventToInitiatorMap.get(lastRecalcStyleForFrame);
                if (initiatorOfRecalcStyle && endTime && endTime > event.ts) {
                    invalidationInitiator = initiatorOfRecalcStyle;
                }
            }
        }
        lastInvalidationEventForFrame.set(event.args.data.frame, invalidationInitiator);
    }
    else if (Types.Events.isLayout(event)) {
        // The initiator of a Layout event is the last Invalidation event.
        const lastInvalidation = lastInvalidationEventForFrame.get(event.args.beginData.frame);
        if (lastInvalidation) {
            storeInitiator({
                event,
                initiator: lastInvalidation,
            });
        }
        // Now clear the last invalidation for the frame: the last invalidation has been linked to a Layout event, so it cannot be the initiator for any future layouts.
        lastInvalidationEventForFrame.delete(event.args.beginData.frame);
    }
    else if (Types.Events.isTimerInstall(event)) {
        timerInstallEventsById.set(event.args.data.timerId, event);
    }
    else if (Types.Events.isTimerFire(event)) {
        const matchingInstall = timerInstallEventsById.get(event.args.data.timerId);
        if (matchingInstall) {
            storeInitiator({ event, initiator: matchingInstall });
        }
    }
    else if (Types.Events.isRequestIdleCallback(event)) {
        requestIdleCallbackEventsById.set(event.args.data.id, event);
    }
    else if (Types.Events.isFireIdleCallback(event)) {
        const matchingRequestEvent = requestIdleCallbackEventsById.get(event.args.data.id);
        if (matchingRequestEvent) {
            storeInitiator({
                event,
                initiator: matchingRequestEvent,
            });
        }
    }
    else if (Types.Events.isWebSocketCreate(event)) {
        webSocketCreateEventsById.set(event.args.data.identifier, event);
    }
    else if (Types.Events.isWebSocketInfo(event) || Types.Events.isWebSocketTransfer(event)) {
        const matchingCreateEvent = webSocketCreateEventsById.get(event.args.data.identifier);
        if (matchingCreateEvent) {
            storeInitiator({
                event,
                initiator: matchingCreateEvent,
            });
        }
    }
    else if (Types.Events.isSchedulePostTaskCallback(event)) {
        schedulePostTaskCallbackEventsById.set(event.args.data.taskId, event);
    }
    else if (Types.Events.isRunPostTaskCallback(event) || Types.Events.isAbortPostTaskCallback(event)) {
        const matchingSchedule = schedulePostTaskCallbackEventsById.get(event.args.data.taskId);
        if (matchingSchedule) {
            storeInitiator({ event, initiator: matchingSchedule });
        }
    }
}
function createRelationshipsFromFlows() {
    const flows = flowsHandlerData().flows;
    for (let i = 0; i < flows.length; i++) {
        const flow = flows[i];
        for (let j = 0; j < flow.length - 1; j++) {
            storeInitiator({ event: flow[j + 1], initiator: flow[j] });
        }
    }
}
function createRelationshipsFromAsyncJSCalls() {
    const asyncCallEntries = AsyncJSCallsHandlerData().schedulerToRunEntryPoints.entries();
    for (const [asyncCaller, asyncCallees] of asyncCallEntries) {
        for (const asyncCallee of asyncCallees) {
            storeInitiator({ event: asyncCallee, initiator: asyncCaller });
        }
    }
}
export async function finalize() {
    createRelationshipsFromFlows();
    createRelationshipsFromAsyncJSCalls();
}
export function data() {
    return {
        eventToInitiator: eventToInitiatorMap,
        initiatorToEvents: initiatorToEventsMap,
    };
}
export function deps() {
    return ['Flows', 'AsyncJSCalls'];
}
//# sourceMappingURL=InitiatorsHandler.js.map