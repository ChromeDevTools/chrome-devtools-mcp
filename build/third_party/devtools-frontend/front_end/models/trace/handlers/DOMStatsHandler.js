// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';
let domStatsByFrameId = new Map();
export function reset() {
    domStatsByFrameId = new Map();
}
export function handleEvent(event) {
    if (!Types.Events.isDOMStats(event)) {
        return;
    }
    const domStatEvents = Platform.MapUtilities.getWithDefault(domStatsByFrameId, event.args.data.frame, () => []);
    domStatEvents.push(event);
}
export async function finalize() {
}
export function data() {
    return { domStatsByFrameId };
}
//# sourceMappingURL=DOMStatsHandler.js.map