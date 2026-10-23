import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class SelectivePermissionsInterventionIssue extends Issue<Protocol.Audits.SelectivePermissionsInterventionIssueDetails> {
    constructor(issueDetails: Protocol.Audits.SelectivePermissionsInterventionIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    primaryKey(): string;
    getDescription(): MarkdownIssueDescription;
    getCategory(): IssueCategory;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): SelectivePermissionsInterventionIssue[];
}
