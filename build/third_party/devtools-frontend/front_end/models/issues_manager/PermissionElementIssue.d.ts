import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { type AffectedElement, Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class PermissionElementIssue extends Issue<Protocol.Audits.PermissionElementIssueDetails> {
    #private;
    constructor(issueDetails: Protocol.Audits.PermissionElementIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription | null;
    elements(): Iterable<AffectedElement>;
    getKind(): IssueKind;
    primaryKey(): string;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): PermissionElementIssue[];
}
