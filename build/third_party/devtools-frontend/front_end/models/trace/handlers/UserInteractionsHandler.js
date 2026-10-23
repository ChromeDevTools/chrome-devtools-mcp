// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as metaHandlerData } from './MetaHandler.js';
import { ScoreClassification } from './PageLoadMetricsHandler.js';
// This handler gathers EventTimings into Interactions, which we use to show
// interactions and highlight long interactions to the user, along with INP.
let beginCommitCompositorFrameEvents = [];
let parseMetaViewportEvents = [];
export const LONG_INTERACTION_THRESHOLD = Helpers.Timing.milliToMicro(Types.Timing.Milli(200));
const INP_GOOD_TIMING = LONG_INTERACTION_THRESHOLD;
const INP_MEDIUM_TIMING = Helpers.Timing.milliToMicro(Types.Timing.Milli(500));
let longestInteractionEvent = null;
let interactionEvents = [];
let interactionEventsWithNoNesting = [];
let eventTimingStartEventsForInteractions = [];
let eventTimingEndEventsForInteractions = [];
export function reset() {
    beginCommitCompositorFrameEvents = [];
    parseMetaViewportEvents = [];
    interactionEvents = [];
    eventTimingStartEventsForInteractions = [];
    eventTimingEndEventsForInteractions = [];
    interactionEventsWithNoNesting = [];
    longestInteractionEvent = null;
}
export function handleEvent(event) {
    if (Types.Events.isBeginCommitCompositorFrame(event)) {
        beginCommitCompositorFrameEvents.push(event);
        return;
    }
    if (Types.Events.isParseMetaViewport(event)) {
        parseMetaViewportEvents.push(event);
        return;
    }
    if (!Types.Events.isEventTiming(event)) {
        return;
    }
    if (Types.Events.isEventTimingEnd(event)) {
        // Store the end event; for each start event that is an interaction, we need the matching end event to calculate the duration correctly.
        eventTimingEndEventsForInteractions.push(event);
    }
    // From this point on we want to find events that represent interactions.
    // These events are always start events - those are the ones that contain all
    // the metadata about the interaction.
    if (!Types.Events.isEventTimingStart(event) || !event.args.data) {
        return;
    }
    const { duration, interactionId } = event.args.data;
    // We exclude events for the sake of interactions if:
    // 1. They have no duration.
    // 2. They have no interactionId
    // 3. They have an interactionId of 0: this indicates that it's not an
    //    interaction that we care about because it hasn't had its own interactionId
    //    set (0 is the default on the backend).
    // See: https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/timing/responsiveness_metrics.cc;l=133;drc=40c209a9c365ebb9f16fb99dfe78c7fe768b9594
    if (duration < 1 || interactionId === undefined || interactionId === 0) {
        return;
    }
    // Store the start event. In the finalize() function we will pair this with
    // its end event and create the synthetic interaction event.
    eventTimingStartEventsForInteractions.push(event);
}
/**
 * See https://web.dev/better-responsiveness-metric/#interaction-types for the
 * table that defines these sets.
 **/
const pointerEventTypes = new Set([
    'pointerdown',
    'touchstart',
    'pointerup',
    'touchend',
    'mousedown',
    'mouseup',
    'click',
]);
const keyboardEventTypes = new Set([
    'keydown',
    'keypress',
    'keyup',
]);
export function categoryOfInteraction(interaction) {
    if (pointerEventTypes.has(interaction.type)) {
        return 'POINTER';
    }
    if (keyboardEventTypes.has(interaction.type)) {
        return 'KEYBOARD';
    }
    return 'OTHER';
}
/**
 * We define a set of interactions as nested where:
 * 1. Their end times align.
 * 2. The longest interaction's start time is earlier than all other
 * interactions with the same end time.
 * 3. The interactions are of the same category [each interaction is either
 * categorised as keyboard, or pointer.]
 *
 * =============A=[pointerup]=
 *        ====B=[pointerdown]=
 *        ===C=[pointerdown]==
 *         ===D=[pointerup]===
 *
 * In this example, B, C and D are all nested and therefore should not be
 * returned from this function.
 *
 * However, in this example we would only consider B nested (under A) and D
 * nested (under C). A and C both stay because they are of different types.
 * ========A=[keydown]====
 *   =======B=[keyup]=====
 *    ====C=[pointerdown]=
 *         =D=[pointerup]=
 *
 * Additionally, this method will also maximise the processing duration of the
 * events that we keep as non-nested. We want to make sure we give an accurate
 * representation of main thread activity, so if we keep an event + hide its
 * nested children, we set the top level event's processing start &
 * processing end to be the earliest processing start & the latest processing
 * end of its children. This ensures we report a more accurate main thread
 * activity time which is important as we want developers to focus on fixing
 * this.
 **/
export function removeNestedInteractionsAndSetProcessingTime(interactions) {
    /**
     * Because we nest events only that are in the same category, we store the
     * longest event for a given end time by category.
     **/
    const earliestEventForEndTimePerCategory = {
        POINTER: new Map(),
        KEYBOARD: new Map(),
        OTHER: new Map(),
    };
    function storeEventIfEarliestForCategoryAndEndTime(interaction) {
        const category = categoryOfInteraction(interaction);
        const earliestEventForEndTime = earliestEventForEndTimePerCategory[category];
        const endTime = Types.Timing.Micro(interaction.ts + interaction.dur);
        const earliestCurrentEvent = earliestEventForEndTime.get(endTime);
        if (!earliestCurrentEvent) {
            earliestEventForEndTime.set(endTime, interaction);
            return;
        }
        if (interaction.ts < earliestCurrentEvent.ts) {
            earliestEventForEndTime.set(endTime, interaction);
        }
        else if (interaction.ts === earliestCurrentEvent.ts &&
            interaction.interactionId === earliestCurrentEvent.interactionId) {
            // We have seen in traces that the same interaction can have multiple
            // events (e.g. a 'click' and a 'pointerdown'). Often only one of these
            // events will have an event handler bound to it which caused delay on
            // the main thread, and the others will not. This leads to a situation
            // where if we pick one of the events that had no event handler, its
            // processing duration (processingEnd - processingStart) will be 0, but if we
            // had picked the event that had the slow event handler, we would show
            // correctly the main thread delay due to the event handler.
            // So, if we find events with the same interactionId and the same
            // begin/end times, we pick the one with the largest (processingEnd -
            // processingStart) time in order to make sure we find the event with the
            // worst main thread delay, as that is the one the user should care
            // about.
            const currentProcessingDuration = earliestCurrentEvent.processingEnd - earliestCurrentEvent.processingStart;
            const newProcessingDuration = interaction.processingEnd - interaction.processingStart;
            // Use the new interaction if it has a longer processing duration than the existing one.
            if (newProcessingDuration > currentProcessingDuration) {
                earliestEventForEndTime.set(endTime, interaction);
            }
        }
        // Maximize the processing duration based on the "children" interactions.
        // We pick the earliest start processing duration, and the latest end
        // processing duration to avoid under-reporting.
        if (interaction.processingStart < earliestCurrentEvent.processingStart) {
            earliestCurrentEvent.processingStart = interaction.processingStart;
            writeSyntheticTimespans(earliestCurrentEvent);
        }
        if (interaction.processingEnd > earliestCurrentEvent.processingEnd) {
            earliestCurrentEvent.processingEnd = interaction.processingEnd;
            writeSyntheticTimespans(earliestCurrentEvent);
        }
    }
    for (const interaction of interactions) {
        storeEventIfEarliestForCategoryAndEndTime(interaction);
    }
    // Combine all the events that we have kept from all the per-category event
    // maps back into an array and sort them by timestamp.
    const keptEvents = Object.values(earliestEventForEndTimePerCategory)
        .flatMap(eventsByEndTime => Array.from(eventsByEndTime.values()));
    keptEvents.sort((eventA, eventB) => {
        return eventA.ts - eventB.ts;
    });
    return keptEvents;
}
function writeSyntheticTimespans(event) {
    const startEvent = event.args.data.beginEvent;
    const endEvent = event.args.data.endEvent;
    event.inputDelay = Types.Timing.Micro(event.processingStart - startEvent.ts);
    event.mainThreadHandling = Types.Timing.Micro(event.processingEnd - event.processingStart);
    event.presentationDelay = Types.Timing.Micro(endEvent.ts - event.processingEnd);
}
export async function finalize() {
    const { navigationsByFrameId } = metaHandlerData();
    const beginAndEndEvents = Platform.ArrayUtilities.mergeOrdered(eventTimingStartEventsForInteractions, eventTimingEndEventsForInteractions, Helpers.Trace.eventTimeComparator);
    // Pair up the begin & end events and create synthetic user timing events.
    const beginEventById = new Map();
    for (const event of beginAndEndEvents) {
        if (Types.Events.isEventTimingStart(event)) {
            const forId = beginEventById.get(event.id) ?? [];
            forId.push(event);
            beginEventById.set(event.id, forId);
        }
        else if (Types.Events.isEventTimingEnd(event)) {
            const beginEvents = beginEventById.get(event.id) ?? [];
            const beginEvent = beginEvents.pop();
            if (!beginEvent) {
                continue;
            }
            const { type, interactionId, timeStamp, processingStart, processingEnd } = beginEvent.args.data;
            if (!type || !interactionId || !timeStamp || !processingStart || !processingEnd) {
                // A valid interaction event that we care about has to have a type (e.g. pointerdown, keyup).
                // We also need to ensure it has an interactionId and various timings. There are edge cases where these aren't included in the trace event.
                continue;
            }
            // In the future we will add microsecond timestamps to the trace events…
            // (See https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/timing/window_performance.cc;l=900-901;drc=b503c262e425eae59ced4a80d59d176ed07152c7 )
            // …but until then we can use the millisecond precision values that are in
            // the trace event. To adjust them to be relative to the event.ts and the
            // trace timestamps, for both processingStart and processingEnd we subtract
            // the event timestamp (NOT event.ts, but the timeStamp millisecond value
            // emitted in args.data), and then add that value to the event.ts. This
            // will give us a processingStart and processingEnd time in microseconds
            // that is relative to event.ts, and can be used when drawing boxes.
            // There is some inaccuracy here as we are converting milliseconds to
            // microseconds, but it is good enough until the backend emits more
            // accurate numbers.
            const processingStartRelativeToTraceTime = Types.Timing.Micro(Helpers.Timing.milliToMicro(processingStart) - Helpers.Timing.milliToMicro(timeStamp) + beginEvent.ts);
            const processingEndRelativeToTraceTime = Types.Timing.Micro((Helpers.Timing.milliToMicro(processingEnd) - Helpers.Timing.milliToMicro(timeStamp)) + beginEvent.ts);
            // Ultimate frameId fallback only needed for TSC, see comments in the type.
            const frameId = beginEvent.args.frame ?? beginEvent.args.data.frame ?? '';
            const navigation = Helpers.Trace.getNavigationForTraceEvent(beginEvent, frameId, navigationsByFrameId);
            const navigationId = navigation?.args.data?.navigationId;
            const interactionEvent = Helpers.SyntheticEvents.SyntheticEventsManager.registerSyntheticEvent({
                // Use the start event to define the common fields.
                rawSourceEvent: beginEvent,
                cat: beginEvent.cat,
                name: beginEvent.name,
                pid: beginEvent.pid,
                tid: beginEvent.tid,
                ph: beginEvent.ph,
                processingStart: processingStartRelativeToTraceTime,
                processingEnd: processingEndRelativeToTraceTime,
                // These will be set in writeSyntheticTimespans()
                inputDelay: Types.Timing.Micro(-1),
                mainThreadHandling: Types.Timing.Micro(-1),
                presentationDelay: Types.Timing.Micro(-1),
                args: {
                    data: {
                        beginEvent,
                        endEvent: event,
                        frame: frameId,
                        navigationId,
                    },
                },
                ts: beginEvent.ts,
                dur: Types.Timing.Micro(event.ts - beginEvent.ts),
                type: beginEvent.args.data.type,
                interactionId: beginEvent.args.data.interactionId,
            });
            writeSyntheticTimespans(interactionEvent);
            interactionEvents.push(interactionEvent);
        }
    }
    // Once we gather up all the interactions, we want to remove nested
    // interactions. Interactions can be nested because one user action (e.g. a
    // click) will cause a pointerdown, pointerup and click. But we don't want to
    // fill the interactions track with lots of noise. To fix this, we go through
    // all the events and remove any nested ones so on the timeline we focus the
    // user on the most important events, which we define as the longest one. But
    // this algorithm assumes the events are in ASC order, so we first sort the
    // set of interactions.
    Helpers.Trace.sortTraceEventsInPlace(interactionEvents);
    interactionEventsWithNoNesting.push(...removeNestedInteractionsAndSetProcessingTime(interactionEvents));
    // Pick the longest interactions from the set that were not nested, as we
    // know those are the set of the largest interactions.
    for (const interactionEvent of interactionEventsWithNoNesting) {
        if (!longestInteractionEvent || longestInteractionEvent.dur < interactionEvent.dur) {
            longestInteractionEvent = interactionEvent;
        }
    }
}
export function data() {
    return {
        beginCommitCompositorFrameEvents,
        parseMetaViewportEvents,
        interactionEvents,
        interactionEventsWithNoNesting,
        longestInteractionEvent,
        interactionsOverThreshold: new Set(interactionEvents.filter(event => {
            return event.dur > LONG_INTERACTION_THRESHOLD;
        })),
    };
}
export function deps() {
    return ['Meta'];
}
/**
 * Classifications sourced from
 * https://web.dev/articles/inp#good-score
 */
export function scoreClassificationForInteractionToNextPaint(timing) {
    if (timing <= INP_GOOD_TIMING) {
        return ScoreClassification.GOOD;
    }
    if (timing <= INP_MEDIUM_TIMING) {
        return ScoreClassification.OK;
    }
    return ScoreClassification.BAD;
}
//# sourceMappingURL=UserInteractionsHandler.js.map