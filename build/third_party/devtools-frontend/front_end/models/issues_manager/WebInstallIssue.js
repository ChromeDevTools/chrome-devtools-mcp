// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Issue } from './Issue.js';
export class WebInstallIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super(`${"WebInstallIssue" /* Protocol.Audits.InspectorIssueCode.WebInstallIssue */}::${issueDetails.reason}`, issueDetails, issuesModel);
    }
    requests() {
        const { manifestUrl, reason } = this.details();
        if (reason === "NoManifest" /* Protocol.Audits.WebInstallIssueReason.NoManifest */ || !manifestUrl) {
            return [];
        }
        return [{ url: manifestUrl }];
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        switch (this.details().reason) {
            case "ManifestParsingOrNetworkError" /* Protocol.Audits.WebInstallIssueReason.ManifestParsingOrNetworkError */:
                return { file: 'webInstallManifestParsingOrNetworkError.md', links: [] };
            case "StartUrlInvalid" /* Protocol.Audits.WebInstallIssueReason.StartUrlInvalid */:
                return { file: 'webInstallStartUrlInvalid.md', links: [] };
            case "ManifestMissingNameOrShortName" /* Protocol.Audits.WebInstallIssueReason.ManifestMissingNameOrShortName */:
                return { file: 'webInstallManifestMissingNameOrShortName.md', links: [] };
            case "ManifestMissingId" /* Protocol.Audits.WebInstallIssueReason.ManifestMissingId */:
                return { file: 'webInstallManifestMissingId.md', links: [] };
            case "NoManifest" /* Protocol.Audits.WebInstallIssueReason.NoManifest */:
                return { file: 'webInstallNoManifest.md', links: [] };
            default:
                console.warn('Unknown WebInstallIssueReason:', this.details().reason);
                return null;
        }
    }
    getKind() {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.webInstallIssueDetails;
        if (!details) {
            console.warn('Web install issue without details received.');
            return [];
        }
        return [new WebInstallIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=WebInstallIssue.js.map