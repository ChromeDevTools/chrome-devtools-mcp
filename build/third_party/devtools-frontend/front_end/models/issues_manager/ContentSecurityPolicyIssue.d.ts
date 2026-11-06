import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { type MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class ContentSecurityPolicyIssue extends Issue<Protocol.Audits.ContentSecurityPolicyIssueDetails> {
    constructor(issueDetails: Protocol.Audits.ContentSecurityPolicyIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null, issueId?: Protocol.Audits.IssueId);
    getCategory(): IssueCategory;
    primaryKey(): string;
    getDescription(): MarkdownIssueDescription | null;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): ContentSecurityPolicyIssue[];
}
export declare const urlViolationCode: string;
export declare const inlineViolationCode: string;
export declare const evalViolationCode: string;
export declare const trustedTypesSinkViolationCode: string;
export declare const trustedTypesPolicyViolationCode: string;
