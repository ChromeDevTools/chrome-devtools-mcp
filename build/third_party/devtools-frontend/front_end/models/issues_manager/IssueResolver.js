// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
/**
 * A class that facilitates resolving an issueId to an issue. See `ResolverBase` for more info.
 */
export class IssueResolver extends Common.ResolverBase.ResolverBase {
    #issuesListener = null;
    #issuesManager;
    constructor(issuesManager) {
        super();
        this.#issuesManager = issuesManager;
    }
    getForId(id) {
        return this.#issuesManager.getIssueById(id) || null;
    }
    #onIssueAdded(event) {
        const { issue } = event.data;
        const id = issue.getIssueId();
        if (id) {
            this.onResolve(id, issue);
        }
    }
    startListening() {
        if (this.#issuesListener) {
            return;
        }
        this.#issuesListener =
            this.#issuesManager.addEventListener("IssueAdded" /* IssueManagerEvents.ISSUE_ADDED */, this.#onIssueAdded, this);
    }
    stopListening() {
        if (!this.#issuesListener) {
            return;
        }
        Common.EventTarget.removeEventListeners([this.#issuesListener]);
        this.#issuesListener = null;
    }
}
//# sourceMappingURL=IssueResolver.js.map