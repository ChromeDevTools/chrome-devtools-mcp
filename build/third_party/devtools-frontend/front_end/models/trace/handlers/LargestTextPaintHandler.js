// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Types from '../types/types.js';
/**
 * A trace file will contain all the text paints that were candidates for the
 * LargestTextPaint. If an LCP event is text, it will point to one of these
 * candidates, so we store them by their DOM Node ID.
 **/
let textPaintByDOMNodeId = new Map();
export function reset() {
    textPaintByDOMNodeId = new Map();
}
export function handleEvent(event) {
    if (!Types.Events.isLargestTextPaintCandidate(event)) {
        return;
    }
    if (!event.args.data) {
        return;
    }
    textPaintByDOMNodeId.set(event.args.data.DOMNodeId, event);
}
export async function finalize() {
}
export function data() {
    return textPaintByDOMNodeId;
}
//# sourceMappingURL=LargestTextPaintHandler.js.map