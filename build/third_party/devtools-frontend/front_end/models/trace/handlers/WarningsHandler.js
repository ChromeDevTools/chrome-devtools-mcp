// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as userInteractionsHandlerData } from './UserInteractionsHandler.js';
import { data as workersData } from './WorkersHandler.js';
let warningsPerEvent = new WeakMap();
let eventsPerWarning = new Map();
/**
 * Tracks the stack formed by nested trace events up to a given point
 */
let allEventsStack = [];
/**
 * Tracks the stack formed by JS invocation trace events up to a given point.
 * F.e. FunctionCall, EvaluateScript, V8Execute.
 * Not to be confused with ProfileCalls.
 */
let jsInvokeStack = [];
/**
 * Tracks reflow events in a task.
 */
let taskReflowEvents = [];
/**
 * Tracks events containing long running tasks. These are compared later against the worker thread pool to filter out long tasks from worker threads.
 */
let longTaskEvents = [];
export const FORCED_REFLOW_THRESHOLD = Helpers.Timing.milliToMicro(Types.Timing.Milli(30));
export const LONG_MAIN_THREAD_TASK_THRESHOLD = Helpers.Timing.milliToMicro(Types.Timing.Milli(50));
export function reset() {
    warningsPerEvent = new WeakMap();
    eventsPerWarning = new Map();
    allEventsStack = [];
    jsInvokeStack = [];
    taskReflowEvents = [];
    longTaskEvents = [];
}
function storeWarning(event, warning) {
    const existingWarnings = Platform.MapUtilities.getWithDefault(warningsPerEvent, event, () => []);
    existingWarnings.push(warning);
    warningsPerEvent.set(event, existingWarnings);
    const existingEvents = Platform.MapUtilities.getWithDefault(eventsPerWarning, warning, () => []);
    existingEvents.push(event);
    eventsPerWarning.set(warning, existingEvents);
}
export function handleEvent(event) {
    processForcedReflowWarning(event);
    if (event.name === Types.Events.Name.RUN_TASK) {
        const { duration } = Helpers.Timing.eventTimingsMicroSeconds(event);
        if (duration > LONG_MAIN_THREAD_TASK_THRESHOLD) {
            longTaskEvents.push(event);
        }
        return;
    }
    if (Types.Events.isFireIdleCallback(event)) {
        const { duration } = Helpers.Timing.eventTimingsMilliSeconds(event);
        if (duration > event.args.data.allottedMilliseconds) {
            storeWarning(event, 'IDLE_CALLBACK_OVER_TIME');
        }
        return;
    }
}
/**
 * Reflows* are added a warning to if:
 * 1. They are forced/sync, meaning they are invoked by JS and finish
 *    during the Script execution.
 * 2. Their duration exceeds a threshold.
 * - *Reflow: The style recalculation and layout steps in a render task.
 */
function processForcedReflowWarning(event) {
    // Update the event and the JS invocation stacks.
    accomodateEventInStack(event, allEventsStack);
    accomodateEventInStack(event, jsInvokeStack, /* pushEventToStack */ Types.Events.isJSInvocationEvent(event));
    if (jsInvokeStack.length) {
        // Current event falls inside a JS call.
        if (event.name === Types.Events.Name.LAYOUT || event.name === Types.Events.Name.RECALC_STYLE) {
            // A forced reflow happened. However we need to check if
            // the threshold is surpassed to add a warning. Accumulate the
            // event to check for this after the current Task is over.
            taskReflowEvents.push(event);
            return;
        }
    }
    if (allEventsStack.length === 1) {
        // We hit a new task. Check if the forced reflows in the previous
        // task exceeded the threshold and add a warning if so.
        const totalTime = taskReflowEvents.reduce((time, event) => time + (event.dur || 0), 0);
        if (totalTime >= FORCED_REFLOW_THRESHOLD) {
            taskReflowEvents.forEach(reflowEvent => storeWarning(reflowEvent, 'FORCED_REFLOW'));
        }
        taskReflowEvents.length = 0;
    }
}
/**
 * Updates a given trace event stack given a new event.
 */
function accomodateEventInStack(event, stack, pushEventToStack = true) {
    let nextItem = stack.at(-1);
    while (nextItem && event.ts > nextItem.ts + (nextItem.dur || 0)) {
        stack.pop();
        nextItem = stack.at(-1);
    }
    if (!pushEventToStack) {
        return;
    }
    stack.push(event);
}
export function deps() {
    return ['UserInteractions', 'Workers'];
}
export async function finalize() {
    // These events do exist on the UserInteractionsHandler, but we also put
    // them into the WarningsHandler so that the warnings handler can be the
    // source of truth and the way to look up all warnings for a given event.
    // Otherwise, we would have to look up warnings across multiple handlers for
    // a given event, which will start to get messy very quickly.
    const longInteractions = userInteractionsHandlerData().interactionsOverThreshold;
    for (const interaction of longInteractions) {
        storeWarning(interaction, 'LONG_INTERACTION');
    }
    for (const event of longTaskEvents) {
        if (!(event.tid, workersData().workerIdByThread.has(event.tid))) {
            storeWarning(event, 'LONG_TASK');
        }
    }
    longTaskEvents.length = 0;
}
export function data() {
    return {
        perEvent: warningsPerEvent,
        perWarning: eventsPerWarning,
    };
}
//# sourceMappingURL=WarningsHandler.js.map