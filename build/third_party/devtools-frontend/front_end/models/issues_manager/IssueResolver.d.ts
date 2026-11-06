import * as Common from '../../core/common/common.js';
import type * as Protocol from '../../generated/protocol.js';
import type { Issue } from './Issue.js';
import { type IssuesManager } from './IssuesManager.js';
/**
 * A class that facilitates resolving an issueId to an issue. See `ResolverBase` for more info.
 */
export declare class IssueResolver extends Common.ResolverBase.ResolverBase<Protocol.Audits.IssueId, Issue> {
    #private;
    constructor(issuesManager: IssuesManager);
    protected getForId(id: Protocol.Audits.IssueId): Issue | null;
    protected startListening(): void;
    protected stopListening(): void;
}
