import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { type MarkdownIssueDescription } from './MarkdownIssueDescription.js';
/** The enum string values need to match the IssueExpanded enum values in UserMetrics.ts. **/
export declare const enum CookieIssueSubCategory {
    GENERIC_COOKIE = "GenericCookie",
    SAME_SITE_COOKIE = "SameSiteCookie"
}
/** Enum to show cookie status from the security panel's third-party cookie report tool **/
export declare const enum CookieStatus {
    BLOCKED = 0,
    ALLOWED = 1,
    ALLOWED_BY_GRACE_PERIOD = 2,
    ALLOWED_BY_HEURISTICS = 3
}
export declare class CookieIssue extends Issue<Protocol.Audits.CookieIssueDetails> {
    #private;
    constructor(code: string, issueDetails: Protocol.Audits.CookieIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null, issueId: Protocol.Audits.IssueId | undefined, frameManager: SDK.FrameManager.FrameManager);
    cookieId(): string;
    primaryKey(): string;
    /**
     * Returns an array of issues from a given CookieIssueDetails.
     */
    static createIssuesFromCookieIssueDetails(cookieIssueDetails: Protocol.Audits.CookieIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null, issueId: Protocol.Audits.IssueId | undefined, frameManager: SDK.FrameManager.FrameManager): CookieIssue[];
    /**
     * Calculates an issue code from a reason, an operation, and an array of warningReasons. All these together
     * can uniquely identify a specific cookie issue.
     * warningReasons is only needed for some CookieExclusionReason in order to determine if an issue should be raised.
     * It is not required if reason is a CookieWarningReason.
     *
     * The issue code will be mapped to a CookieIssueSubCategory enum for metric purpose.
     */
    static codeForCookieIssueDetails(reason: Protocol.Audits.CookieExclusionReason | Protocol.Audits.CookieWarningReason, warningReasons: Protocol.Audits.CookieWarningReason[], operation: Protocol.Audits.CookieOperation): string | null;
    cookies(): Iterable<Protocol.Audits.AffectedCookie>;
    rawCookieLines(): Iterable<string>;
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription | null;
    isCausedByThirdParty(): boolean;
    getKind(): IssueKind;
    static getCookieStatus(cookieIssueDetails: Protocol.Audits.CookieIssueDetails): CookieStatus | undefined;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue, frameManager: SDK.FrameManager.FrameManager): CookieIssue[];
    static getSubCategory(code: string): CookieIssueSubCategory;
    static isThirdPartyCookiePhaseoutRelatedIssue(issue: Issue): boolean;
    maybeCreateConsoleMessage(): SDK.ConsoleModel.ConsoleMessage | undefined;
}
/**
 * Exported for unit test.
 */
export declare function isCausedByThirdParty(outermostFrame: SDK.ResourceTreeModel.ResourceTreeFrame | null, cookieUrl?: string, siteForCookies?: string): boolean;
