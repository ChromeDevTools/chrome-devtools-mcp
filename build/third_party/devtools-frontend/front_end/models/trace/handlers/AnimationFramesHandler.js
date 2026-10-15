// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
function threadKey(data) {
    return `${data.pid}-${data.tid}`;
}
// Track all the start + end events. We key them by the PID+TID so we don't
// accidentally pair across different threads.
let animationFrameStarts = new Map();
let animationFrameEnds = new Map();
// Store all the AnimationFrame::Presentation events. Key them by their ID for
// easy look-up later on when we associate one to the AnimationFrame event.
let animationFramePresentations = new Map();
// The final list of animation frames that we return.
let animationFrames = [];
let presentationForFrame = new WeakMap();
export function reset() {
    animationFrameStarts = new Map();
    animationFrameEnds = new Map();
    animationFrames = [];
    presentationForFrame = new WeakMap();
    animationFramePresentations = new Map();
    isEnabled = false;
}
let isEnabled = false;
export function handleUserConfig(config) {
    isEnabled = config.enableAnimationsFrameHandler;
}
export function handleEvent(event) {
    if (!isEnabled) {
        return;
    }
    if (Types.Events.isAnimationFrameAsyncStart(event)) {
        const key = threadKey(event);
        const existing = animationFrameStarts.get(key) ?? [];
        existing.push(event);
        animationFrameStarts.set(key, existing);
    }
    else if (Types.Events.isAnimationFrameAsyncEnd(event)) {
        const key = threadKey(event);
        const existing = animationFrameEnds.get(key) ?? [];
        existing.push(event);
        animationFrameEnds.set(key, existing);
    }
    else if (Types.Events.isAnimationFramePresentation(event) && event.args?.id) {
        animationFramePresentations.set(event.args.id, event);
    }
}
export async function finalize() {
    // AnimationFrames are represented with begin & end events on a stack; so we
    // can pair them by walking through the list of start events and pairing with
    // the same index in the list of end events, once both lists are sorted by
    // timestamp.
    // We walk through the set of begin/end events we gathered per pid+tid and
    // pair those up.
    // Unfortunately we cannot use the pairing helpers in Helpers.Trace because
    // only the begin event has an ID; the end event does not. But because we
    // know that AnimationFrames are sequential and do not overlap, we can pair
    // up events easily.
    for (const [key, startEvents] of animationFrameStarts.entries()) {
        const endEvents = animationFrameEnds.get(key);
        if (!endEvents) {
            continue;
        }
        Helpers.Trace.sortTraceEventsInPlace(startEvents);
        Helpers.Trace.sortTraceEventsInPlace(endEvents);
        for (let i = 0; i < startEvents.length; i++) {
            const endEvent = endEvents.at(i);
            if (!endEvent) {
                // Invalid data: break. We can't pair any other events up.
                break;
            }
            const startEvent = startEvents[i];
            const syntheticEvent = Helpers.SyntheticEvents.SyntheticEventsManager
                .registerSyntheticEvent({
                rawSourceEvent: startEvent,
                ...startEvent,
                dur: Types.Timing.Micro(endEvent.ts - startEvent.ts),
                args: {
                    data: {
                        beginEvent: startEvent,
                        endEvent,
                    },
                },
            });
            animationFrames.push(syntheticEvent);
            // AnimationFrame begin events + AnimationFrame::Presentation events share
            // an args.id, so we can pair them up based on that.
            const id = startEvent.args?.id;
            if (id) {
                const presentationEvent = animationFramePresentations.get(id);
                if (presentationEvent) {
                    presentationForFrame.set(syntheticEvent, presentationEvent);
                }
            }
        }
    }
}
export function data() {
    return {
        animationFrames,
        presentationForFrame,
    };
}
export function deps() {
    return ['Meta'];
}
//# sourceMappingURL=AnimationFramesHandler.js.map