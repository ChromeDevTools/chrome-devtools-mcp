import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { type MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class UnencodedDigestIssue extends Issue<Protocol.Audits.UnencodedDigestIssueDetails> {
    constructor(issueDetails: Protocol.Audits.UnencodedDigestIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    primaryKey(): string;
    getDescription(): MarkdownIssueDescription | null;
    getCategory(): IssueCategory;
    getKind(): IssueKind;
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): UnencodedDigestIssue[];
}
