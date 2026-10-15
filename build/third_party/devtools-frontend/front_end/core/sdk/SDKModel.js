// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
const registeredModels = new Map();
// TODO(crbug.com/1228674) Remove defaults for generic type parameters once
//                         all event emitters and sinks have been migrated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class SDKModel extends Common.ObjectWrapper.ObjectWrapper {
    #target;
    constructor(target) {
        super();
        this.#target = target;
    }
    target() {
        return this.#target;
    }
    /**
     * Override this method to perform tasks that are required to suspend the
     * model and that still need other models in an unsuspended state.
     */
    async preSuspendModel(_reason) {
    }
    async suspendModel(_reason) {
    }
    async resumeModel() {
    }
    /**
     * Override this method to perform tasks that are required to after resuming
     * the model and that require all models already in an unsuspended state.
     */
    async postResumeModel() {
    }
    dispose() {
    }
    static register(modelClass, registrationInfo) {
        if (registrationInfo.early && !registrationInfo.autostart) {
            throw new Error(`Error registering model ${modelClass.name}: early models must be autostarted.`);
        }
        registeredModels.set(modelClass, registrationInfo);
    }
    static get registeredModels() {
        return registeredModels;
    }
}
//# sourceMappingURL=SDKModel.js.map