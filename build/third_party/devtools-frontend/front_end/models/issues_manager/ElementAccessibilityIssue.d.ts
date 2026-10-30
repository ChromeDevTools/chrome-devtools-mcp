import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { type AffectedElement, Issue, IssueCategory, IssueKind } from './Issue.js';
import { type MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class ElementAccessibilityIssue extends Issue<Protocol.Audits.ElementAccessibilityIssueDetails> {
    constructor(issueDetails: Protocol.Audits.ElementAccessibilityIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null, issueId?: Protocol.Audits.IssueId);
    elements(): Iterable<AffectedElement>;
    primaryKey(): string;
    getDescription(): MarkdownIssueDescription | null;
    getKind(): IssueKind;
    getCategory(): IssueCategory;
    isInteractiveContentAttributesSelectDescendantIssue(): boolean;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): ElementAccessibilityIssue[];
}
