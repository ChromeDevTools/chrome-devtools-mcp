import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class MixedContentIssue extends Issue<Protocol.Audits.MixedContentIssueDetails> {
    constructor(issueDetails: Protocol.Audits.MixedContentIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription;
    primaryKey(): string;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): MixedContentIssue[];
}
