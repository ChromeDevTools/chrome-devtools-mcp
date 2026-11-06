import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { type MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class FederatedAuthUserInfoRequestIssue extends Issue<Protocol.Audits.FederatedAuthUserInfoRequestIssueDetails> {
    constructor(issueDetails: Protocol.Audits.FederatedAuthUserInfoRequestIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel);
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription | null;
    primaryKey(): string;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel, inspectorIssue: Protocol.Audits.InspectorIssue): FederatedAuthUserInfoRequestIssue[];
}
