// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
export var Events;
(function (Events) {
    Events["DOM_ISSUE_ADDED"] = "DOMIssueAdded";
    Events["DOM_ISSUE_REMOVED"] = "DOMIssueRemoved";
})(Events || (Events = {}));
export class DOMIssuesManager extends Common.ObjectWrapper.ObjectWrapper {
    #issuesManager;
    #targetManager;
    #currentIssues = new Set();
    #nodeToIssues = new Platform.MapUtilities.Multimap();
    #nodeIdSubscribers = new Platform.MapUtilities.Multimap();
    constructor(issuesManager, targetManager) {
        super();
        this.#issuesManager = issuesManager;
        this.#targetManager = targetManager;
        this.#issuesManager.addEventListener("IssueAdded" /* IssuesManagerEvents.ISSUE_ADDED */, this.#onIssueAdded, this);
        this.#issuesManager.addEventListener("IssueHiddenStatusUpdated" /* IssuesManagerEvents.ISSUE_HIDDEN_STATUS_UPDATED */, this.#onIssueHiddenStatusUpdated, this);
        this.#issuesManager.addEventListener("FullUpdateRequired" /* IssuesManagerEvents.FULL_UPDATE_REQUIRED */, this.#onFullUpdateRequired, this);
        this.#targetManager.addModelListener(SDK.DOMModel.DOMModel, SDK.DOMModel.Events.DocumentUpdated, this.#onDocumentUpdated, this, { scoped: true });
    }
    subscribeByNodeId(nodeId, callback) {
        this.#nodeIdSubscribers.set(nodeId, callback);
    }
    unsubscribeByNodeId(nodeId, callback) {
        this.#nodeIdSubscribers.delete(nodeId, callback);
    }
    issuesForNode(node) {
        return Array.from(this.#nodeToIssues.get(node));
    }
    #onIssueAdded(event) {
        void this.#addIssue(event.data.issue);
    }
    #onIssueHiddenStatusUpdated(event) {
        const { issue } = event.data;
        if (issue.isHidden()) {
            void this.#removeIssue(issue);
        }
        else {
            void this.#addIssue(issue);
        }
    }
    #onFullUpdateRequired() {
        const newIssues = new Set(this.#issuesManager.issues());
        for (const issue of this.#currentIssues) {
            if (!newIssues.has(issue) || issue.isHidden()) {
                void this.#removeIssue(issue);
            }
        }
        for (const issue of newIssues) {
            if (!issue.isHidden()) {
                void this.#addIssue(issue);
            }
        }
    }
    #onDocumentUpdated(_event) {
        this.#nodeToIssues.clear();
        for (const issue of this.#issuesManager.issues()) {
            if (!issue.isHidden()) {
                void this.#addIssue(issue);
            }
        }
    }
    async #resolveNodesForIssue(issue) {
        const primaryTarget = this.#targetManager.primaryPageTarget() ?? this.#targetManager.targets()[0];
        const nodes = [];
        for (const element of issue.elements()) {
            const elementTarget = (element.target && typeof element.target.model === 'function') ?
                element.target :
                primaryTarget;
            if (!elementTarget) {
                continue;
            }
            const domModel = elementTarget.model(SDK.DOMModel.DOMModel);
            if (!domModel) {
                continue;
            }
            const deferredDOMNode = new SDK.DOMModel.DeferredDOMNode(elementTarget, element.backendNodeId);
            const node = await deferredDOMNode.resolvePromise();
            if (node) {
                nodes.push(node);
            }
        }
        return nodes;
    }
    async #addIssue(issue) {
        if (issue.isHidden()) {
            return;
        }
        this.#currentIssues.add(issue);
        const nodes = await this.#resolveNodesForIssue(issue);
        for (const node of nodes) {
            if (!this.#nodeToIssues.hasValue(node, issue)) {
                this.#nodeToIssues.set(node, issue);
                this.dispatchEventToListeners("DOMIssueAdded" /* Events.DOM_ISSUE_ADDED */, { node, issue });
                for (const callback of this.#nodeIdSubscribers.get(node.id)) {
                    callback();
                }
            }
        }
    }
    async #removeIssue(issue) {
        this.#currentIssues.delete(issue);
        const nodes = await this.#resolveNodesForIssue(issue);
        for (const node of nodes) {
            if (this.#nodeToIssues.hasValue(node, issue)) {
                this.#nodeToIssues.delete(node, issue);
                this.dispatchEventToListeners("DOMIssueRemoved" /* Events.DOM_ISSUE_REMOVED */, { node, issue });
                for (const callback of this.#nodeIdSubscribers.get(node.id)) {
                    callback();
                }
            }
        }
    }
}
//# sourceMappingURL=DOMIssuesManager.js.map