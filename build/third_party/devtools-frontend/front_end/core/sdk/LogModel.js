// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../host/host.js';
import { SDKModel } from './SDKModel.js';
export class LogModel extends SDKModel {
    #logAgent;
    constructor(target) {
        super(target);
        target.registerLogDispatcher(this);
        this.#logAgent = target.logAgent();
        void this.#logAgent.invoke_enable();
        if (!Host.InspectorFrontendHost.isUnderTest()) {
            void this.#logAgent.invoke_startViolationsReport({
                config: [
                    { name: "longTask" /* Protocol.Log.ViolationSettingName.LongTask */, threshold: 200 },
                    { name: "longLayout" /* Protocol.Log.ViolationSettingName.LongLayout */, threshold: 30 },
                    { name: "blockedEvent" /* Protocol.Log.ViolationSettingName.BlockedEvent */, threshold: 100 },
                    { name: "blockedParser" /* Protocol.Log.ViolationSettingName.BlockedParser */, threshold: -1 },
                    { name: "handler" /* Protocol.Log.ViolationSettingName.Handler */, threshold: 150 },
                    { name: "recurringHandler" /* Protocol.Log.ViolationSettingName.RecurringHandler */, threshold: 50 },
                    { name: "discouragedAPIUse" /* Protocol.Log.ViolationSettingName.DiscouragedAPIUse */, threshold: -1 },
                ],
            });
        }
    }
    entryAdded({ entry }) {
        this.dispatchEventToListeners("EntryAdded" /* Events.ENTRY_ADDED */, { logModel: this, entry });
    }
    requestClear() {
        void this.#logAgent.invoke_clear();
    }
}
SDKModel.register(LogModel, { capabilities: 8 /* Capability.LOG */, autostart: true });
//# sourceMappingURL=LogModel.js.map