// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Title for a learn more link in selective permissions intervention issue description.
     */
    selectivePermissionsIntervention: 'Selective permissions intervention',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/SelectivePermissionsInterventionIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class SelectivePermissionsInterventionIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super("SelectivePermissionsInterventionIssue" /* Protocol.Audits.InspectorIssueCode.SelectivePermissionsInterventionIssue */, issueDetails, issuesModel);
    }
    primaryKey() {
        return `${"SelectivePermissionsInterventionIssue" /* Protocol.Audits.InspectorIssueCode.SelectivePermissionsInterventionIssue */}-${JSON.stringify(this.details())}`;
    }
    getDescription() {
        return {
            file: 'selectivePermissionsIntervention.md',
            links: [
                {
                    link: 'https://crbug.com/435223477',
                    linkTitle: i18nString(UIStrings.selectivePermissionsIntervention),
                },
            ],
        };
    }
    getCategory() {
        return "SelectivePermissionsIntervention" /* IssueCategory.SELECTIVE_PERMISSIONS_INTERVENTION */;
    }
    getKind() {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const selectivePermissionsInterventionIssueDetails = inspectorIssue.details.selectivePermissionsInterventionIssueDetails;
        if (!selectivePermissionsInterventionIssueDetails) {
            console.warn('Selective Permissions Intervention issue without details received.');
            return [];
        }
        return [new SelectivePermissionsInterventionIssue(selectivePermissionsInterventionIssueDetails, issuesModel)];
    }
}
//# sourceMappingURL=SelectivePermissionsInterventionIssue.js.map