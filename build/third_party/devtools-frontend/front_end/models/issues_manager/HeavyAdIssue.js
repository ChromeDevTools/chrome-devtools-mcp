// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Title for a learn more link in heavy ads issue description.
     */
    handlingHeavyAdInterventions: 'Handling heavy ad interventions',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/HeavyAdIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class HeavyAdIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        const umaCode = ["HeavyAdIssue" /* Protocol.Audits.InspectorIssueCode.HeavyAdIssue */, issueDetails.reason].join('::');
        super({ code: "HeavyAdIssue" /* Protocol.Audits.InspectorIssueCode.HeavyAdIssue */, umaCode }, issueDetails, issuesModel);
    }
    primaryKey() {
        return `${"HeavyAdIssue" /* Protocol.Audits.InspectorIssueCode.HeavyAdIssue */}-${JSON.stringify(this.details())}`;
    }
    getDescription() {
        return {
            file: 'heavyAd.md',
            links: [
                {
                    link: 'https://developers.google.com/web/updates/2020/05/heavy-ad-interventions',
                    linkTitle: i18nString(UIStrings.handlingHeavyAdInterventions),
                },
            ],
        };
    }
    getCategory() {
        return "HeavyAd" /* IssueCategory.HEAVY_AD */;
    }
    getKind() {
        switch (this.details().resolution) {
            case "HeavyAdBlocked" /* Protocol.Audits.HeavyAdResolutionStatus.HeavyAdBlocked */:
                return "PageError" /* IssueKind.PAGE_ERROR */;
            case "HeavyAdWarning" /* Protocol.Audits.HeavyAdResolutionStatus.HeavyAdWarning */:
                return "BreakingChange" /* IssueKind.BREAKING_CHANGE */;
        }
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const heavyAdIssueDetails = inspectorIssue.details.heavyAdIssueDetails;
        if (!heavyAdIssueDetails) {
            console.warn('Heavy ad issue without details received.');
            return [];
        }
        return [new HeavyAdIssue(heavyAdIssueDetails, issuesModel)];
    }
}
//# sourceMappingURL=HeavyAdIssue.js.map