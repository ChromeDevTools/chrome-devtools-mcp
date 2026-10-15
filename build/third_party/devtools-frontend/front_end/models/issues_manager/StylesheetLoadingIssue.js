// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Issue } from './Issue.js';
export const lateImportStylesheetLoadingCode = [
    "StylesheetLoadingIssue" /* Protocol.Audits.InspectorIssueCode.StylesheetLoadingIssue */,
    "LateImportRule" /* Protocol.Audits.StyleSheetLoadingIssueReason.LateImportRule */,
].join('::');
export class StylesheetLoadingIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        const code = `${"StylesheetLoadingIssue" /* Protocol.Audits.InspectorIssueCode.StylesheetLoadingIssue */}::${issueDetails.styleSheetLoadingIssueReason}`;
        super(code, issueDetails, issuesModel);
    }
    sources() {
        return [this.details().sourceCodeLocation];
    }
    requests() {
        const details = this.details();
        if (!details.failedRequestInfo) {
            return [];
        }
        const { url, requestId } = details.failedRequestInfo;
        if (!requestId) {
            return [];
        }
        return [{ url, requestId }];
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getDescription() {
        switch (this.details().styleSheetLoadingIssueReason) {
            case "LateImportRule" /* Protocol.Audits.StyleSheetLoadingIssueReason.LateImportRule */:
                return {
                    file: 'stylesheetLateImport.md',
                    links: [],
                };
            case "RequestFailed" /* Protocol.Audits.StyleSheetLoadingIssueReason.RequestFailed */:
                return {
                    file: 'stylesheetRequestFailed.md',
                    links: [],
                };
        }
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getKind() {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    static fromInspectorIssue(issueModel, inspectorIssue) {
        const stylesheetLoadingDetails = inspectorIssue.details.stylesheetLoadingIssueDetails;
        if (!stylesheetLoadingDetails) {
            console.warn('Stylesheet loading issue without details received');
            return [];
        }
        return [new StylesheetLoadingIssue(stylesheetLoadingDetails, issueModel)];
    }
}
//# sourceMappingURL=StylesheetLoadingIssue.js.map