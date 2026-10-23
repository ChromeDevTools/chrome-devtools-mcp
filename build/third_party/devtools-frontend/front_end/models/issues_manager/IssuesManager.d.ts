import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as Bindings from '../bindings/bindings.js';
import * as Workspace from '../workspace/workspace.js';
import type { Issue, IssueKind } from './Issue.js';
import { Events } from './IssuesManagerEvents.js';
export { Events } from './IssuesManagerEvents.js';
export declare function isIssueCodeSupported(code: Protocol.Audits.InspectorIssueCode): boolean;
/**
 * Each issue reported by the backend can result in multiple `Issue` instances.
 * Handlers are simple functions hard-coded into a map.
 */
export declare function createIssuesFromProtocolIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue, frameManager?: SDK.FrameManager.FrameManager): Issue[];
export interface IssuesManagerCreationOptions {
    forceNew: boolean;
    frameManager?: SDK.FrameManager.FrameManager;
    /** Throw an error if this is not the first instance created */
    ensureFirst: boolean;
    showThirdPartyIssuesSetting?: Common.Settings.Setting<boolean>;
    hideIssueSetting?: Common.Settings.Setting<HideIssueMenuSetting>;
}
export type HideIssueMenuSetting = Record<string, IssueStatus>;
export declare const enum IssueStatus {
    HIDDEN = "Hidden",
    UNHIDDEN = "Unhidden"
}
export declare function defaultHideIssueByCodeSetting(): HideIssueMenuSetting;
export declare function getHideIssueByCodeSetting(settings?: Common.Settings.Settings): Common.Settings.Setting<HideIssueMenuSetting>;
/**
 * The `IssuesManager` is the central storage for issues. It collects issues from all the
 * `IssuesModel` instances in the page, and deduplicates them wrt their primary key.
 * It also takes care of clearing the issues when it sees a main-frame navigated event.
 * Any client can subscribe to the events provided, and/or query the issues via the public
 * interface.
 *
 * Additionally, the `IssuesManager` can filter Issues. All Issues are stored, but only
 * Issues that are accepted by the filter cause events to be fired or are returned by
 * `IssuesManager#issues()`.
 */
export declare class IssuesManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.IssuesModel.IssuesModel> {
    #private;
    private readonly showThirdPartyIssuesSetting?;
    private readonly hideIssueSetting?;
    constructor(showThirdPartyIssuesSetting?: Common.Settings.Setting<boolean> | undefined, hideIssueSetting?: Common.Settings.Setting<HideIssueMenuSetting> | undefined, frameManager?: SDK.FrameManager.FrameManager, targetManager?: SDK.TargetManager.TargetManager, workspace?: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding?: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, cssWorkspaceBinding?: Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding);
    static instance(opts?: IssuesManagerCreationOptions): IssuesManager;
    static removeInstance(): void;
    modelAdded(issuesModel: SDK.IssuesModel.IssuesModel): void;
    modelRemoved(issuesModel: SDK.IssuesModel.IssuesModel): void;
    addIssue(issuesModel: SDK.IssuesModel.IssuesModel, issue: Issue): void;
    issues(): Iterable<Issue>;
    numberOfIssues(kind?: IssueKind): number;
    numberOfHiddenIssues(kind?: IssueKind): number;
    numberOfThirdPartyCookiePhaseoutIssues(kind?: IssueKind): number;
    numberOfAllStoredIssues(): number;
    unhideAllIssues(): void;
    getIssueById(id: string): Issue | undefined;
}
export interface IssueAddedEvent {
    issuesModel: SDK.IssuesModel.IssuesModel;
    issue: Issue;
}
export interface IssueHiddenStatusUpdatedEvent {
    issue: Issue;
}
export interface EventTypes {
    [Events.ISSUES_COUNT_UPDATED]: void;
    [Events.FULL_UPDATE_REQUIRED]: void;
    [Events.ISSUE_ADDED]: IssueAddedEvent;
    [Events.ISSUE_HIDDEN_STATUS_UPDATED]: IssueHiddenStatusUpdatedEvent;
}
