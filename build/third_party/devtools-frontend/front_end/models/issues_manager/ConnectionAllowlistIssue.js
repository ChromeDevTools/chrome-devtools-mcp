// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Title for Connection-Allowlist specification URL.
     */
    connectionAllowlistHeader: 'Connection-Allowlist specification',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/ConnectionAllowlistIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class ConnectionAllowlistIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super({
            code: `${"ConnectionAllowlistIssue" /* Protocol.Audits.InspectorIssueCode.ConnectionAllowlistIssue */}::${issueDetails.error}`,
            umaCode: `${"ConnectionAllowlistIssue" /* Protocol.Audits.InspectorIssueCode.ConnectionAllowlistIssue */}::${issueDetails.error}`,
        }, issueDetails, issuesModel);
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getDescription() {
        const description = {
            file: `connectionAllowlist${this.details().error}.md`,
            links: [
                {
                    link: 'https://wicg.github.io/private-network-access/#connection-allowlist',
                    linkTitle: i18nLazyString(UIStrings.connectionAllowlistHeader),
                },
            ],
        };
        return resolveLazyDescription(description);
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getKind() {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    requests() {
        return this.details().request ? [this.details().request] : [];
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.connectionAllowlistIssueDetails;
        if (!details) {
            console.warn('Connection-Allowlist issue without details received.');
            return [];
        }
        return [new ConnectionAllowlistIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=ConnectionAllowlistIssue.js.map