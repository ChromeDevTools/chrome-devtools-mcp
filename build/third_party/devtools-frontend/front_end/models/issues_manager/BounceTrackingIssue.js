// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Title for Bounce Tracking Mitigation explainer URL link.
     */
    bounceTrackingMitigations: 'Bounce tracking mitigations',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/BounceTrackingIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class BounceTrackingIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super("BounceTrackingIssue" /* Protocol.Audits.InspectorIssueCode.BounceTrackingIssue */, issueDetails, issuesModel);
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        return {
            file: 'bounceTrackingMitigations.md',
            links: [
                {
                    link: 'https://privacycg.github.io/nav-tracking-mitigations/#bounce-tracking-mitigations',
                    linkTitle: i18nString(UIStrings.bounceTrackingMitigations),
                },
            ],
        };
    }
    getKind() {
        return "BreakingChange" /* IssueKind.BREAKING_CHANGE */;
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    trackingSites() {
        return this.details().trackingSites;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.bounceTrackingIssueDetails;
        if (!details) {
            console.warn('Bounce tracking issue without details received.');
            return [];
        }
        return [new BounceTrackingIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=BounceTrackingIssue.js.map