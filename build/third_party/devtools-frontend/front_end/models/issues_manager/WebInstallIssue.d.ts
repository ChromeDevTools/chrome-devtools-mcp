import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class WebInstallIssue extends Issue<Protocol.Audits.WebInstallIssueDetails> {
    constructor(issueDetails: Protocol.Audits.WebInstallIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    requests(): Protocol.Audits.AffectedRequest[];
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription | null;
    getKind(): IssueKind;
    primaryKey(): string;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): WebInstallIssue[];
}
