// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Label for the link for mixed content issues.
     */
    preventingMixedContent: 'Preventing mixed content',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/MixedContentIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class MixedContentIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super("MixedContentIssue" /* Protocol.Audits.InspectorIssueCode.MixedContentIssue */, issueDetails, issuesModel);
    }
    requests() {
        const details = this.details();
        if (details.request) {
            return [details.request];
        }
        return [];
    }
    getCategory() {
        return "MixedContent" /* IssueCategory.MIXED_CONTENT */;
    }
    getDescription() {
        return {
            file: 'mixedContent.md',
            links: [{ link: 'https://web.dev/what-is-mixed-content/', linkTitle: i18nString(UIStrings.preventingMixedContent) }],
        };
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getKind() {
        switch (this.details().resolutionStatus) {
            case "MixedContentAutomaticallyUpgraded" /* Protocol.Audits.MixedContentResolutionStatus.MixedContentAutomaticallyUpgraded */:
                return "Improvement" /* IssueKind.IMPROVEMENT */;
            case "MixedContentBlocked" /* Protocol.Audits.MixedContentResolutionStatus.MixedContentBlocked */:
                return "PageError" /* IssueKind.PAGE_ERROR */;
            case "MixedContentWarning" /* Protocol.Audits.MixedContentResolutionStatus.MixedContentWarning */:
                return "Improvement" /* IssueKind.IMPROVEMENT */;
        }
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const mixedContentDetails = inspectorIssue.details.mixedContentIssueDetails;
        if (!mixedContentDetails) {
            console.warn('Mixed content issue without details received.');
            return [];
        }
        return [new MixedContentIssue(mixedContentDetails, issuesModel)];
    }
}
//# sourceMappingURL=MixedContentIssue.js.map