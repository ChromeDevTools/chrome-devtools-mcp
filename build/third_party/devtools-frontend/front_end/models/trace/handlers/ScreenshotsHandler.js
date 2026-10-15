// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
let legacyScreenshotEvents = [];
let modernScreenshotEvents = [];
let syntheticScreenshots = [];
export function reset() {
    legacyScreenshotEvents = [];
    syntheticScreenshots = [];
    modernScreenshotEvents = [];
}
export function handleEvent(event) {
    if (Types.Events.isLegacyScreenshot(event)) {
        legacyScreenshotEvents.push(event);
    }
    else if (Types.Events.isScreenshot(event)) {
        modernScreenshotEvents.push(event);
    }
}
export async function finalize() {
    for (const snapshotEvent of legacyScreenshotEvents) {
        const { cat, name, ph, pid, tid } = snapshotEvent;
        const syntheticEvent = Helpers.SyntheticEvents.SyntheticEventsManager.registerSyntheticEvent({
            rawSourceEvent: snapshotEvent,
            cat,
            name,
            ph,
            pid,
            tid,
            // TODO(paulirish, crbug.com/41363012): fix snapshot timestamps.
            ts: snapshotEvent.ts,
            args: {
                dataUri: `data:image/jpg;base64,${snapshotEvent.args.snapshot}`,
            },
        });
        syntheticScreenshots.push(syntheticEvent);
    }
}
export function screenshotImageDataUri(event) {
    if (Types.Events.isLegacySyntheticScreenshot(event)) {
        return event.args.dataUri;
    }
    return `data:image/jpg;base64,${event.args.snapshot}`;
}
export function data() {
    return {
        legacySyntheticScreenshots: syntheticScreenshots.length ? syntheticScreenshots : null,
        screenshots: modernScreenshotEvents.length ? modernScreenshotEvents : null,
    };
}
export function deps() {
    return ['Meta'];
}
//# sourceMappingURL=ScreenshotsHandler.js.map