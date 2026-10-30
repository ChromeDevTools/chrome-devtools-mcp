import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { type AffectedElement, Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class LazyLoadImageIssue extends Issue<Protocol.Audits.LazyLoadImageIssueDetails> {
    constructor(issueDetails: Protocol.Audits.LazyLoadImageIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    primaryKey(): string;
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription;
    elementCount(): number;
    elements(): Iterable<AffectedElement>;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): LazyLoadImageIssue[];
}
