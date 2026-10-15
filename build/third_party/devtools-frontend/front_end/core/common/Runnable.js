// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const registeredLateInitializationRunnables = new Map();
export function registerLateInitializationRunnable(setting) {
    const { id, loadRunnable } = setting;
    if (registeredLateInitializationRunnables.has(id)) {
        throw new Error(`Duplicate late Initializable runnable id '${id}'`);
    }
    registeredLateInitializationRunnables.set(id, loadRunnable);
}
export function maybeRemoveLateInitializationRunnable(runnableId) {
    return registeredLateInitializationRunnables.delete(runnableId);
}
export function lateInitializationRunnables() {
    return [...registeredLateInitializationRunnables.values()];
}
const registeredEarlyInitializationRunnables = [];
export function registerEarlyInitializationRunnable(runnable) {
    registeredEarlyInitializationRunnables.push(runnable);
}
export function earlyInitializationRunnables() {
    return registeredEarlyInitializationRunnables;
}
//# sourceMappingURL=Runnable.js.map