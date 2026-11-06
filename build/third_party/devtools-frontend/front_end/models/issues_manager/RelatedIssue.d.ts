import * as SDK from '../../core/sdk/sdk.js';
import type { Issue, IssueCategory } from './Issue.js';
import type { IssuesManager } from './IssuesManager.js';
export type IssuesAssociatable = Readonly<SDK.NetworkRequest.NetworkRequest> | SDK.Cookie.Cookie | string;
/**
 * @throws In case obj has an unsupported type (i.e. not part of the IssuesAssociatble union).
 */
export declare function issuesAssociatedWith(issues: Issue[], obj: IssuesAssociatable): Issue[];
export declare function hasIssues(obj: IssuesAssociatable, issuesManager: IssuesManager): boolean;
export declare function hasIssueOfCategory(obj: IssuesAssociatable, category: IssueCategory, issuesManager: IssuesManager): boolean;
export declare function reveal(obj: IssuesAssociatable, issuesManager: IssuesManager, category?: IssueCategory): Promise<void | undefined>;
