// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Types from '../types/types.js';
let frames = new Map();
export function reset() {
    frames = new Map();
}
export function handleEvent(event) {
    if (Types.Events.isTracingStartedInBrowser(event)) {
        for (const frame of event.args.data?.frames ?? []) {
            // The ID of a frame is stored under the `frame` key.
            frames.set(frame.frame, frame);
        }
        return;
    }
    // CommitLoad events can contain an updated URL or Name for a frame.
    if (Types.Events.isCommitLoad(event)) {
        const frameData = event.args.data;
        if (!frameData) {
            return;
        }
        // We don't want to mutate the original object, hence why
        // we set a new object from the new and existing values.
        const frame = frames.get(frameData.frame);
        if (!frame) {
            return;
        }
        frames.set(frameData.frame, {
            ...frame,
            url: frameData.url || frame.url,
            name: frameData.name || frameData.name,
        });
    }
}
export async function finalize() {
}
export function data() {
    return {
        frames,
    };
}
//# sourceMappingURL=PageFramesHandler.js.map