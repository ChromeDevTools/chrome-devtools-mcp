// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as metaHandlerData } from './MetaHandler.js';
// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
let eventsInProcessThread = new Map();
let mainGPUThreadTasks = [];
export function reset() {
    eventsInProcessThread = new Map();
    mainGPUThreadTasks = [];
}
export function handleEvent(event) {
    if (!Types.Events.isGPUTask(event)) {
        return;
    }
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
}
export async function finalize() {
    const { gpuProcessId, gpuThreadId } = metaHandlerData();
    const gpuThreadsForProcess = eventsInProcessThread.get(gpuProcessId);
    if (gpuThreadsForProcess && gpuThreadId) {
        mainGPUThreadTasks = gpuThreadsForProcess.get(gpuThreadId) || [];
    }
}
export function data() {
    return {
        mainGPUThreadTasks,
    };
}
export function deps() {
    return ['Meta'];
}
//# sourceMappingURL=GPUHandler.js.map