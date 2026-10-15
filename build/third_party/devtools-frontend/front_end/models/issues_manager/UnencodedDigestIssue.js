// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Title for HTTP Unencoded Digest specification URL.
     */
    unencodedDigestHeader: 'HTTP Unencoded Digest specification',
    /**
     * @description Title for the URL of the integration of unencoded-digest and SRI.
     */
    integrityIntegration: 'Server-initiated integrity checks',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/UnencodedDigestIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class UnencodedDigestIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super({
            code: `${"UnencodedDigestIssue" /* Protocol.Audits.InspectorIssueCode.UnencodedDigestIssue */}::${issueDetails.error}`,
            umaCode: `${"UnencodedDigestIssue" /* Protocol.Audits.InspectorIssueCode.UnencodedDigestIssue */}::${issueDetails.error}`,
        }, issueDetails, issuesModel);
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getDescription() {
        const description = {
            file: `unencodedDigest${this.details().error}.md`,
            links: [
                {
                    link: 'https://www.ietf.org/archive/id/draft-ietf-httpbis-unencoded-digest-01.html',
                    linkTitle: i18nLazyString(UIStrings.unencodedDigestHeader),
                },
                {
                    link: 'https://wicg.github.io/signature-based-sri/#unencoded-digest-validation',
                    linkTitle: i18nLazyString(UIStrings.integrityIntegration),
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
        const details = inspectorIssue.details.unencodedDigestIssueDetails;
        if (!details) {
            console.warn('Unencoded-Digest issue without details received.');
            return [];
        }
        return [new UnencodedDigestIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=UnencodedDigestIssue.js.map