// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as Workspace from '../../models/workspace/workspace.js';
import { ContentSecurityPolicyIssue, trustedTypesPolicyViolationCode, trustedTypesSinkViolationCode, } from './ContentSecurityPolicyIssue.js';
import { toZeroBasedLocation } from './Issue.js';
import { getIssueTitleFromMarkdownDescription } from './MarkdownIssueDescription.js';
import { PropertyRuleIssue } from './PropertyRuleIssue.js';
import { lateImportStylesheetLoadingCode } from './StylesheetLoadingIssue.js';
export class SourceFrameIssuesManager {
    issuesManager;
    #sourceFrameMessageManager;
    constructor(issuesManager, targetManager, workspace, debuggerWorkspaceBinding, cssWorkspaceBinding) {
        this.issuesManager = issuesManager;
        this.#sourceFrameMessageManager =
            new Bindings.PresentationConsoleMessageHelper.PresentationSourceFrameMessageManager(targetManager, workspace, debuggerWorkspaceBinding, cssWorkspaceBinding);
        this.#sourceFrameMessageManager.enable();
        this.issuesManager.addEventListener("IssueAdded" /* Events.ISSUE_ADDED */, this.#onIssueAdded, this);
        this.issuesManager.addEventListener("FullUpdateRequired" /* Events.FULL_UPDATE_REQUIRED */, this.#onFullUpdateRequired, this);
    }
    #onIssueAdded(event) {
        const { issue } = event.data;
        void this.#addIssue(issue);
    }
    async #addIssue(issue) {
        if (!this.#isTrustedTypeIssue(issue) && !this.#isLateImportIssue(issue) && !this.#isPropertyRuleIssue(issue)) {
            return;
        }
        const issuesModel = issue.model();
        if (!issuesModel) {
            return;
        }
        const srcLocation = toZeroBasedLocation(issue.details().sourceCodeLocation);
        const description = issue.getDescription();
        if (!description || !srcLocation) {
            return;
        }
        const messageText = await getIssueTitleFromMarkdownDescription(description);
        if (!messageText) {
            return;
        }
        const clickHandler = () => {
            void Common.Revealer.reveal(issue);
        };
        this.#sourceFrameMessageManager.addMessage(new IssueMessage(messageText, issue.getKind(), clickHandler), {
            line: srcLocation.lineNumber,
            column: srcLocation.columnNumber ?? -1,
            url: srcLocation.url,
            scriptId: srcLocation.scriptId,
        }, issuesModel.target());
    }
    #onFullUpdateRequired() {
        this.#resetMessages();
        const issues = this.issuesManager.issues();
        for (const issue of issues) {
            void this.#addIssue(issue);
        }
    }
    #isTrustedTypeIssue(issue) {
        return issue instanceof ContentSecurityPolicyIssue && issue.code() === trustedTypesSinkViolationCode ||
            issue.code() === trustedTypesPolicyViolationCode;
    }
    #isPropertyRuleIssue(issue) {
        return issue instanceof PropertyRuleIssue;
    }
    #isLateImportIssue(issue) {
        return issue.code() === lateImportStylesheetLoadingCode;
    }
    #resetMessages() {
        this.#sourceFrameMessageManager.clear();
    }
}
export class IssueMessage extends Workspace.UISourceCode.Message {
    #kind;
    constructor(title, kind, clickHandler) {
        super("Issue" /* Workspace.UISourceCode.Message.Level.ISSUE */, title, clickHandler);
        this.#kind = kind;
    }
    getIssueKind() {
        return this.#kind;
    }
}
//# sourceMappingURL=SourceFrameIssuesManager.js.map