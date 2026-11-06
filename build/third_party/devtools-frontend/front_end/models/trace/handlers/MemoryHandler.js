// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';
let updateCountersByProcess = new Map();
export function reset() {
    updateCountersByProcess = new Map();
}
export function handleEvent(event) {
    if (Types.Events.isUpdateCounters(event)) {
        const countersForProcess = Platform.MapUtilities.getWithDefault(updateCountersByProcess, event.pid, () => []);
        countersForProcess.push(event);
        updateCountersByProcess.set(event.pid, countersForProcess);
    }
}
export async function finalize() {
}
export function data() {
    return { updateCountersByProcess };
}
//# sourceMappingURL=MemoryHandler.js.map