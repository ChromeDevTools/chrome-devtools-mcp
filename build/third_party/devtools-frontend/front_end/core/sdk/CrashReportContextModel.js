// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { SDKModel } from './SDKModel.js';
export class CrashReportContextModel extends SDKModel {
    #agent;
    constructor(target) {
        super(target);
        this.#agent = target.crashReportContextAgent();
    }
    async getEntries() {
        const response = await this.#agent.invoke_getEntries();
        if (response.getError()) {
            return null;
        }
        return response.entries;
    }
}
SDKModel.register(CrashReportContextModel, { capabilities: 4 /* Capability.JS */, autostart: false });
//# sourceMappingURL=CrashReportContextModel.js.map