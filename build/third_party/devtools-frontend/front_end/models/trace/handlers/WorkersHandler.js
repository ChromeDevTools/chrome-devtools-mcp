// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Types from '../types/types.js';
let sessionIdEvents = [];
let workerIdByThread = new Map();
let workerURLById = new Map();
export function reset() {
    sessionIdEvents = [];
    workerIdByThread = new Map();
    workerURLById = new Map();
}
export function handleEvent(event) {
    if (Types.Events.isTracingSessionIdForWorker(event)) {
        sessionIdEvents.push(event);
    }
}
export async function finalize() {
    for (const sessionIdEvent of sessionIdEvents) {
        if (!sessionIdEvent.args.data) {
            continue;
        }
        workerIdByThread.set(sessionIdEvent.args.data.workerThreadId, sessionIdEvent.args.data.workerId);
        workerURLById.set(sessionIdEvent.args.data.workerId, sessionIdEvent.args.data.url);
    }
}
export function data() {
    return {
        workerSessionIdEvents: sessionIdEvents,
        workerIdByThread,
        workerURLById,
    };
}
//# sourceMappingURL=WorkersHandler.js.map