// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
let animations = [];
let animationsSyntheticEvents = [];
export function reset() {
    animations = [];
    animationsSyntheticEvents = [];
}
export function handleEvent(event) {
    if (Types.Events.isAnimation(event)) {
        animations.push(event);
        return;
    }
}
export async function finalize() {
    const syntheticEvents = Helpers.Trace.createMatchedSortedSyntheticEvents(animations);
    animationsSyntheticEvents.push(...syntheticEvents);
}
export function data() {
    return {
        animations: animationsSyntheticEvents,
    };
}
//# sourceMappingURL=AnimationHandler.js.map