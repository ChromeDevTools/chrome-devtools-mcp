// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
export class ChangeTracker {
    #commentManager;
    constructor(commentManager) {
        this.#commentManager = commentManager;
    }
    get isTracking() {
        return Boolean(Root.Runtime.hostConfig.devToolsComments?.enabled) && this.#commentManager.isAgentAttached();
    }
    trackChange(description, anchor) {
        if (!this.isTracking) {
            return;
        }
        const thread = this.#commentManager.createCommentThread(anchor, description, 'DEVELOPER', true);
        thread.save();
        Host.userMetrics.changeRecorded(1);
    }
}
//# sourceMappingURL=ChangeTracker.js.map