import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class QuirksModeIssue extends Issue<Protocol.Audits.QuirksModeIssueDetails> {
    constructor(issueDetails: Protocol.Audits.QuirksModeIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    primaryKey(): string;
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): QuirksModeIssue[];
}
