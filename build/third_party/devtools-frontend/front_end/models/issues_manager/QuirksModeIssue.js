// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Link title for the Quirks Mode issue in the Issues panel.
     */
    documentCompatibilityMode: 'Document compatibility mode',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/QuirksModeIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class QuirksModeIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        const mode = issueDetails.isLimitedQuirksMode ? 'LimitedQuirksMode' : 'QuirksMode';
        const umaCode = ["QuirksModeIssue" /* Protocol.Audits.InspectorIssueCode.QuirksModeIssue */, mode].join('::');
        super({ code: "QuirksModeIssue" /* Protocol.Audits.InspectorIssueCode.QuirksModeIssue */, umaCode }, issueDetails, issuesModel);
    }
    primaryKey() {
        return `${this.code()}-(${this.details().documentNodeId})-(${this.details().url})`;
    }
    getCategory() {
        return "QuirksMode" /* IssueCategory.QUIRKS_MODE */;
    }
    getDescription() {
        return {
            file: 'CompatibilityModeQuirks.md',
            links: [
                {
                    link: 'https://web.dev/doctype/',
                    linkTitle: i18nString(UIStrings.documentCompatibilityMode),
                },
            ],
        };
    }
    getKind() {
        return "Improvement" /* IssueKind.IMPROVEMENT */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const quirksModeIssueDetails = inspectorIssue.details.quirksModeIssueDetails;
        if (!quirksModeIssueDetails) {
            console.warn('Quirks Mode issue without details received.');
            return [];
        }
        return [new QuirksModeIssue(quirksModeIssueDetails, issuesModel)];
    }
}
//# sourceMappingURL=QuirksModeIssue.js.map