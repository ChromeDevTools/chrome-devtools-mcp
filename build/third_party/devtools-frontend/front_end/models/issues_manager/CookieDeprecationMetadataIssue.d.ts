import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
/** TODO(b/305738703): Move this issue into a warning on CookieIssue. **/
export declare class CookieDeprecationMetadataIssue extends Issue<Protocol.Audits.CookieDeprecationMetadataIssueDetails> {
    constructor(issueDetails: Protocol.Audits.CookieDeprecationMetadataIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription;
    getKind(): IssueKind;
    primaryKey(): string;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): CookieDeprecationMetadataIssue[];
}
