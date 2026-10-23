// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Label for a link for third-party cookie issues.
     */
    thirdPartyPhaseoutExplained: 'Changes to Chrome’s treatment of third-party cookies',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/CookieDeprecationMetadataIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/** TODO(b/305738703): Move this issue into a warning on CookieIssue. **/
export class CookieDeprecationMetadataIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        // Set a distinct code for ReadCookie and SetCookie issues, so they are grouped separately.
        const issueCode = "CookieDeprecationMetadataIssue" /* Protocol.Audits.InspectorIssueCode.CookieDeprecationMetadataIssue */ + '_' + issueDetails.operation;
        super(issueCode, issueDetails, issuesModel);
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        let fileName = this.details().operation === 'SetCookie' ? 'cookieWarnMetadataGrantSet.md' : 'cookieWarnMetadataGrantRead.md';
        const substitutions = new Map();
        if (this.details().isOptOutTopLevel) {
            fileName = this.details().operation === 'SetCookie' ? 'cookieWarnMetadataGrantSetOptOut.md' :
                'cookieWarnMetadataGrantReadOptOut.md';
            substitutions.set('PLACEHOLDER_optOutPercentage', String(this.details().optOutPercentage));
        }
        return {
            file: fileName,
            substitutions,
            links: [
                {
                    link: 'https://goo.gle/changes-to-chrome-browsing',
                    linkTitle: i18nString(UIStrings.thirdPartyPhaseoutExplained),
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
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.cookieDeprecationMetadataIssueDetails;
        if (!details) {
            console.warn('Cookie deprecation metadata issue without details received.');
            return [];
        }
        return [new CookieDeprecationMetadataIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=CookieDeprecationMetadataIssue.js.map