import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class HeavyAdIssue extends Issue<Protocol.Audits.HeavyAdIssueDetails> {
    constructor(issueDetails: Protocol.Audits.HeavyAdIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    primaryKey(): string;
    getDescription(): MarkdownIssueDescription;
    getCategory(): IssueCategory;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): HeavyAdIssue[];
}
