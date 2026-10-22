import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class PropertyRuleIssue extends Issue<Protocol.Audits.PropertyRuleIssueDetails> {
    #private;
    constructor(issueDetails: Protocol.Audits.PropertyRuleIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    sources(): Protocol.Audits.SourceCodeLocation[];
    primaryKey(): string;
    getPropertyName(): string;
    getDescription(): MarkdownIssueDescription;
    getCategory(): IssueCategory;
    getKind(): IssueKind;
    static fromInspectorIssue(issueModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): PropertyRuleIssue[];
}
